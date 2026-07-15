import type { NextConfig } from "next";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { normalizeBookBasePath } from "./src/shared/base-path";

const isStaticExport = process.env["BOOK_DEPLOYMENT"] === "static";
const isProduction = process.env["NODE_ENV"] === "production";
const deploymentBasePath = normalizeBookBasePath(process.env["BOOK_BASE_PATH"]);

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "base-uri 'self'",
      "connect-src 'self'",
      "font-src 'self' data:",
      "frame-ancestors 'none'",
      "frame-src 'none'",
      "img-src 'self' data: blob:",
      "media-src 'self'",
      "object-src 'none'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "worker-src 'self' blob:",
    ].join("; "),
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), geolocation=(), microphone=(), payment=()",
  },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
] as const;

const nextConfig: NextConfig = {
  basePath: deploymentBasePath,
  distDir: isProduction ? ".next" : ".next-dev",
  env: {
    NEXT_PUBLIC_BOOK_BASE_PATH: deploymentBasePath,
  },
  output: isStaticExport ? "export" : "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  trailingSlash: isStaticExport,
  turbopack: {
    root: process.cwd(),
  },
  generateBuildId: async () => {
    const artifactIndex = await readFile(
      path.resolve(process.cwd(), "build", "artifact-index.json"),
    );
    return createHash("sha256")
      .update(artifactIndex)
      .digest("hex")
      .slice(0, 32);
  },
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  ...(!isProduction
    ? {
        allowedDevOrigins: ["127.0.0.1"],
      }
    : {}),
  ...(isStaticExport || !isProduction
    ? {}
    : {
        headers: async () => [
          {
            source: "/:path*",
            headers: [...securityHeaders],
          },
        ],
      }),
};

export default nextConfig;
