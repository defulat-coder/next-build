/** 持久化端口：直接复用 packages/db 的窄接口契约（端口契约留在 packages，业务规则不进 packages）。 */
export type { IamStore } from "@next-build/db";
