const SAFE_PATH_SEGMENT = /^[A-Za-z0-9._~-]+$/u;

export function normalizeBookBasePath(input: string | undefined): string {
  const trimmed = input?.trim() ?? "";
  if (trimmed === "" || trimmed === "/") return "";

  const normalized = trimmed.replace(/\/+$/u, "");
  const segments = normalized.slice(1).split("/");
  if (
    !normalized.startsWith("/") ||
    normalized.startsWith("//") ||
    segments.some(
      (segment) =>
        segment === "" ||
        segment === "." ||
        segment === ".." ||
        !SAFE_PATH_SEGMENT.test(segment),
    )
  ) {
    throw new Error(
      `Book base path must contain only safe absolute path segments; received ${JSON.stringify(input)}.`,
    );
  }

  return normalized;
}

export function prefixBookBasePath(target: string, basePath: string): string {
  if (
    basePath === "" ||
    !target.startsWith("/") ||
    target.startsWith("//") ||
    target === basePath ||
    target.startsWith(`${basePath}/`)
  ) {
    return target;
  }

  return `${basePath}${target}`;
}
