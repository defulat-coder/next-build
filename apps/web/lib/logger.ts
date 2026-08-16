import { pino } from "pino";

/**
 * 全局日志单例（组合根唯一配置出口；packages/* 只接受注入的 Logger，不引用本模块）。
 * 事件契约见 AGENTS.md「日志」：稳定事件名（event 字段）+ 固定字段，永不记录 token/密钥。
 *
 * 落盘为主（自托管内部工具，无平台日志采集）：
 * - `data/logs/app.N.log`：全量 JSON 日志（相对 process.cwd()=apps/web；pino-roll 按天 + 50MB 轮转，
 *   N 为递增序号，保留最近 14 份）；
 * - `data/logs/error.N.log`：仅 error 及以上，同样轮转——线上排查先看这个；
 * - dev 额外 pretty 到终端（开发体验）；transport 走 worker 线程，不阻塞事件循环。
 */
const LOG_DIR = "data/logs";

/** 轮转策略：daily + 单文件 50MB，保留最近 14 份（pino-roll 约定）。 */
const rollingFile = (name: string, level: string) => ({
  level,
  options: {
    file: `${LOG_DIR}/${name}`,
    frequency: "daily" as const,
    limit: { count: 14 },
    mkdir: true,
    size: "50m",
  },
  target: "pino-roll",
});

const isProd = process.env.NODE_ENV === "production";

export const logger = pino({
  level: isProd ? "info" : "debug",
  transport: {
    targets: [
      ...(isProd
        ? []
        : [
            {
              level: "debug",
              options: { ignore: "pid,hostname", translateTime: "SYS:HH:MM:ss" },
              target: "pino-pretty",
            },
          ]),
      rollingFile("app.log", isProd ? "info" : "debug"),
      rollingFile("error.log", "error"),
    ],
  },
});
