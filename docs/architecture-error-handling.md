# 异常架构设计

> 状态：已定稿。约定摘要见 AGENTS.md「异常处理」「日志」两节，本文是完整设计。

## 1. 核心思想：错误的种类是类型系统的一等公民

业务异常 vs 系统异常不是日志级别的事后选择，而是**错误定义时就确定的类型属性**：

```ts
type AppError =
  // 业务异常：预期内、用户可读。message 面向用户，透传给前端，4xx，日志 warn。
  | { kind: "business"; code: string; message: string; cause?: unknown }
  // 系统异常：非预期/基础设施。message 面向开发者，边界替换为通用文案，5xx，日志 error。
  | { kind: "system"; code: string; message: string; cause?: unknown };
```

`kind` 在**产生错误的地方**标注——那里的上下文最足。边界（API、前端）不判断种类，只读 `kind` 执行策略。这一个字段驱动三件事：HTTP 状态码、message 是否透传、日志级别。

## 2. 分层模型：异常的四段旅程

```
产生层          翻译层              传输层                  呈现层
packages/*      Hono handler        HTTP                    前端
lib/*           ↓                   { error: {              fetch 封装
  ↓ Result      respondWithError()    code,                 error.tsx
  ↓ throw       读 kind 执行策略       message,               ↓
                                   request_id? }          用户看到
```

| 层 | 职责 | 不允许做的事 |
| --- | --- | --- |
| 产生层（packages/db、packages/sandbox、lib/*） | 定义带 `kind` 的领域错误；可恢复失败返回 `Result`；`cause` 携带原始异常 | 不允许决定 HTTP 状态码；不允许裸 `Error`/字符串 |
| 翻译层（API 边界） | 唯一出口 `respondWithError(c, error)`：按 `kind` 映射状态码/文案策略/日志级别 | 不允许各路由自行拼接错误响应 |
| 传输层 | `{ error: { code, message } }`；系统异常附 `request_id`（用户报障时凭它找到日志里的堆栈） | 系统异常不透传内部 message |
| 呈现层（前端） | fetch 封装按 `error.code` 提示；业务异常直接显示 message，系统异常显示通用文案 + code | 不允许吞掉 Result / 忽略错误响应 |

## 3. 错误码注册表（Single Source of Truth）

`apps/web/lib/errors.ts`：所有错误码的一张表，每条记录 `kind`、默认用户文案、HTTP 状态码。

```ts
// 示意
export const ERROR_REGISTRY = {
  UNAUTHORIZED:               { kind: "business", status: 401, message: "请先登录" },
  STATE_MISMATCH:             { kind: "business", status: 400, message: "登录状态校验失败，请重试" },
  FEISHU_TOKEN_EXCHANGE_FAILED: { kind: "business", status: 502, message: "飞书授权失败，请重试" },
  DB_READ_FAILED:             { kind: "system", status: 500, message: "服务暂时不可用" },
  SANDBOX_UNAVAILABLE:        { kind: "system", status: 503, message: "执行环境暂时不可用" },
  INTERNAL_ERROR:             { kind: "system", status: 500, message: "服务器内部错误" },
} as const;
```

收益：新错误码必须进表才能用（评审可查）；前端的提示映射和文案不再两处漂移；`kind` 的判定集中可查。

## 4. 兜底机制：六道防线

```
① 点位级   tryCatch 包裹可失败操作 → Result          （已落地：@next-build/result）
② 路由级   handler 翻译 Result → 结构化错误响应       （已落地：auth 路由；respondWithError 待抽）
③ 应用级   app.onError 捕获未处理异常 → 500 + err 全堆栈（已落地）
④ 进程级   instrumentation.ts register() 挂           （待补）
             unhandledRejection / uncaughtException
             → fatal 日志（完整堆栈）后退出
⑤ 渲染级   Next app/error.tsx 全局错误边界            （待补）
             页面渲染炸 → 兜底 UI + 重试按钮，不白屏
⑥ 任务级   沙箱内任务失败写状态 stage:"failed" + error （任务链路实现时落地）
           + 任务看门狗：超时未完成的沙箱强制销毁
```

设计原则：

- **防线只兜"漏网之鱼"**：③④⑤ 触发即代表①②有漏网，日志里要能被数出来（`api.error`、`process.fatal` 事件量应当趋近于 0，涨了就回去修点位）。
- **兜底的代价是信息降级**：越靠外的防线能说的越少，所以③④⑤的日志必须是**完整堆栈**——那是唯一的现场。
- **系统异常对用户报 `request_id`**：用户一句话"我这边报 INTERNAL_ERROR，id 是 xxx"，就能在日志里精确捞出堆栈，这是 AI 时代最便宜的排障通道。

## 5. 与日志契约的咬合

- 业务异常 → `warn` + `error.code` + 用户可读 message；系统异常 → `error` + `err`（原始 Error，pino 序列化带堆栈）。
- 同一失败只记一次：产生层记 or 边界记，不重复记（默认产生层记——那里上下文最全）。
- 聚合用 `error.code`（低基数枚举），检索用 `request_id` / `task_id`，现场用 `err.stack`。
