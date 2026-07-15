import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer, type ServerResponse } from "node:http";
import path from "node:path";

import { normalizeBookBasePath } from "../src/shared/base-path";

const DEFAULT_PORT = 3_000;
const STATIC_DIRECTORY = process.env["STATIC_DIRECTORY"] ?? "out";
const staticRoot = path.resolve(process.cwd(), STATIC_DIRECTORY);
const basePath = normalizeBookBasePath(process.env["BOOK_BASE_PATH"]);

const mediaTypes: Readonly<Record<string, string>> = {
  ".avif": "image/avif",
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".webm": "video/webm",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function parsePort(rawPort: string | undefined): number {
  if (rawPort === undefined) return DEFAULT_PORT;
  const port = Number.parseInt(rawPort, 10);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error(
      `PORT must be an integer from 1 through 65535; received ${JSON.stringify(rawPort)}.`,
    );
  }
  return port;
}

function confinedPath(pathname: string): string | undefined {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return undefined;
  }
  if (decoded.includes("\0") || decoded.includes("\\")) return undefined;
  const segments = decoded.split("/").filter((segment) => segment.length > 0);
  if (segments.some((segment) => segment === "." || segment === ".."))
    return undefined;

  const candidate = path.resolve(staticRoot, ...segments);
  const relative = path.relative(staticRoot, candidate);
  if (
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    return undefined;
  }
  return candidate;
}

function stripBasePath(pathname: string): string | undefined {
  if (basePath === "") return pathname;
  if (pathname === basePath || pathname === `${basePath}/`) return "/";
  return pathname.startsWith(`${basePath}/`)
    ? pathname.slice(basePath.length)
    : undefined;
}

async function regularFile(candidate: string): Promise<string | undefined> {
  try {
    const metadata = await stat(candidate);
    if (metadata.isFile()) return candidate;
    if (!metadata.isDirectory()) return undefined;
    const indexPath = path.join(candidate, "index.html");
    return (await stat(indexPath)).isFile() ? indexPath : undefined;
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error.code === "ENOENT" || error.code === "ENOTDIR")
    ) {
      return undefined;
    }
    throw error;
  }
}

function sendFile(
  response: ServerResponse,
  absolutePath: string,
  method: string,
): void {
  response.statusCode = 200;
  response.setHeader(
    "Content-Type",
    mediaTypes[path.extname(absolutePath).toLowerCase()] ??
      "application/octet-stream",
  );
  response.setHeader("X-Content-Type-Options", "nosniff");
  if (method === "HEAD") {
    response.end();
    return;
  }

  const stream = createReadStream(absolutePath);
  stream.on("error", () => {
    if (!response.headersSent) response.statusCode = 500;
    response.end();
  });
  stream.pipe(response);
}

const port = parsePort(process.env["PORT"]);
const server = createServer(async (request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.statusCode = 405;
    response.setHeader("Allow", "GET, HEAD");
    response.end();
    return;
  }

  try {
    const url = new URL(request.url ?? "/", "http://static.invalid");
    const mountedPath = stripBasePath(url.pathname);
    const candidate =
      mountedPath === undefined ? undefined : confinedPath(mountedPath);
    const resolved =
      candidate === undefined ? undefined : await regularFile(candidate);
    if (resolved !== undefined) {
      sendFile(response, resolved, request.method);
      return;
    }

    const notFound = await regularFile(path.join(staticRoot, "404.html"));
    if (notFound === undefined) {
      response.statusCode = 404;
      response.end("Not found");
      return;
    }
    response.statusCode = 404;
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    if (request.method === "HEAD") response.end();
    else createReadStream(notFound).pipe(response);
  } catch {
    response.statusCode = 500;
    response.end("Static test server failure");
  }
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(
    `Static test server listening on http://127.0.0.1:${port}${basePath}/\n`,
  );
});

function shutdown(): void {
  server.close((error) => {
    process.exitCode = error === undefined ? 0 : 1;
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
