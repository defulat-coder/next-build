import { NextResponse, type NextRequest } from "next/server";

/**
 * 页面整站保护：无 nb_session cookie 的页面请求 307 到 /login。
 * 只判 cookie 是否存在（边缘运行时无法查库）；会话真实性由 API 侧的 Hono 守卫把关。
 * （Next 16 的 proxy 文件约定，即原 middleware。）
 */
export function proxy(request: NextRequest) {
  if (!request.cookies.has("nb_session")) {
    return NextResponse.redirect(new URL("/login", request.url), 307);
  }
  return NextResponse.next();
}

export const config = {
  // 放行：登录页、全部 /api（401 由 Hono 守卫返回 JSON，页面才适合 307）、Next 内部资源，
  // 以及所有带扩展名的静态文件（favicon.ico、logo-*.svg、avatars/*.png 等 public 资源）。
  matcher: ["/((?!login|api|_next|.*\\..+).*)"],
};
