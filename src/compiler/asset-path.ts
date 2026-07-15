import path from "node:path";

import type { AssetPolicy, SourceRecord } from "./model";

export interface AssetOutputLocation {
  readonly relativeFilePath: string;
  readonly publicUrl: string;
}

export function assetOutputLocation(
  source: Pick<SourceRecord, "contentHash" | "normalizedPath">,
  policy: AssetPolicy,
): AssetOutputLocation {
  const directory = source.contentHash.slice(0, 16);
  const fileName = path.posix.basename(source.normalizedPath);
  const prefix = `/${policy.outputPrefix.replace(/^\/+|\/+$/gu, "")}`;
  return {
    relativeFilePath: path.posix.join("assets", directory, fileName),
    publicUrl: `${prefix}/${directory}/${encodeURIComponent(fileName)}`,
  };
}
