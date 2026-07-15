import { normalizeBookBasePath, prefixBookBasePath } from "@/shared/base-path";

const deploymentBasePath = normalizeBookBasePath(
  process.env.NEXT_PUBLIC_BOOK_BASE_PATH,
);

export function withBookBasePath(target: string): string {
  return prefixBookBasePath(target, deploymentBasePath);
}
