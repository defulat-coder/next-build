/**
 * 零依赖 Result 工具（见 AGENTS.md「异常处理」）：
 * 预期/可恢复错误作为值返回，非预期错误才 throw。
 * 错误对象约定为判别联合（code 常量 + message + 可选 cause），由各包自行定义。
 */

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { error, ok: false };
}

export function map<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return result.ok ? ok(fn(result.value)) : result;
}

export function mapError<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> {
  return result.ok ? result : err(fn(result.error));
}

export function flatMap<T, U, E>(result: Result<T, E>, fn: (value: T) => Result<U, E>): Result<U, E> {
  return result.ok ? fn(result.value) : result;
}

/** 包一个 Promise：reject 时经 mapError 收敛为调用方定义的错误对象。 */
export async function tryCatch<T, E>(
  promise: Promise<T>,
  mapErrorFn: (cause: unknown) => E,
): Promise<Result<T, E>> {
  try {
    return ok(await promise);
  } catch (cause) {
    return err(mapErrorFn(cause));
  }
}

/** tryCatch 的同步版本。 */
export function tryCatchSync<T, E>(fn: () => T, mapErrorFn: (cause: unknown) => E): Result<T, E> {
  try {
    return ok(fn());
  } catch (cause) {
    return err(mapErrorFn(cause));
  }
}
