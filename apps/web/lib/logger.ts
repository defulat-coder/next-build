import { pino } from "pino";

/**
 * 全局日志单例（组合根唯一配置出口；packages/* 只接受注入的 Logger，不引用本模块）。
 * 事件契约见 AGENTS.md「日志」：稳定事件名（event 字段）+ 固定字段，永不记录 token/密钥。
 */
export const logger = pino({
  level: process.env.NODE_ENV === "production" ? "info" : "debug",
  transport:
    process.env.NODE_ENV === "production"
      ? undefined
      : {
          options: { ignore: "pid,hostname", translateTime: "SYS:HH:MM:ss" },
          target: "pino-pretty",
        },
});
