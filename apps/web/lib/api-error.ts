/** API 错误体（AGENTS.md 异常约定）：业务异常 message 可直接展示。 */
export interface ApiErrorBody {
  error: { code: string; message: string };
}

/** 读取 API 错误 message；非标准错误体回退为通用文案。 */
export async function readApiError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
  return body?.error.message ?? "请求失败，请重试。";
}
