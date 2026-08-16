import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  typedRoutes: true,
  // monorepo 内的 workspace 包直接以 TS 源码分发，交给 Next 转译。
  transpilePackages: ["@next-build/db", "@next-build/result", "@next-build/sandbox"],
  // 原生模块与 CLI 型依赖不走打包，按 Node 外部依赖加载。
  serverExternalPackages: ["better-sqlite3", "@anthropic-ai/claude-agent-sdk", "microsandbox", "openwiki", "pino", "pino-pretty", "pino-roll"],
  // 飞书头像的 CDN 域名不固定（feishucdn/bytednsdoc 等多个），内部工具放宽到任意 https 来源。
  images: {
    remotePatterns: [{ hostname: "**", protocol: "https" }],
  },
  // public/ 下的静态资源没有内容哈希，给一周浏览器缓存而非 immutable。
  async headers() {
    return [
      {
        headers: [
          { key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=86400" },
        ],
        source: "/images/:path*",
      },
    ];
  },
};

export default nextConfig;
