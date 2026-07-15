"use client";

import type { ArtifactEnvelope, SearchRecord } from "@/compiler/model";
import { withBookBasePath } from "@/runtime/base-path";

interface SearchIndexManifest {
  readonly chunks: readonly {
    readonly path: string;
    readonly recordCount: number;
  }[];
}

interface SearchChunk {
  readonly records: readonly SearchRecord[];
}

export interface SearchResult {
  readonly record: SearchRecord;
  readonly score: number;
}

export interface SearchProvider {
  initialize(signal?: AbortSignal): Promise<void>;
  query(input: string, limit: number): readonly SearchResult[];
}

function tokenizeQuery(input: string): readonly string[] {
  return [
    ...input.toLocaleLowerCase("en-US").matchAll(/[\p{L}\p{N}_-]+/gu),
  ].map((match) => match[0]);
}

function scoreRecord(record: SearchRecord, tokens: readonly string[]): number {
  const normalizedText = record.text.toLocaleLowerCase("en-US");
  let score = record.weight;

  for (const token of tokens) {
    const index = normalizedText.indexOf(token);
    if (index < 0) {
      return Number.NEGATIVE_INFINITY;
    }

    score += index === 0 ? 8 : 2;
    score += Math.max(0, 4 - index / 80);
  }

  return score;
}

function assertEnvelope<T>(
  value: unknown,
  location: string,
): ArtifactEnvelope<T> {
  if (
    typeof value !== "object" ||
    value === null ||
    !("schemaVersion" in value) ||
    !("data" in value)
  ) {
    throw new Error(`Invalid search artifact envelope at ${location}`);
  }

  return value as ArtifactEnvelope<T>;
}

export class StaticSearchProvider implements SearchProvider {
  readonly #records: SearchRecord[] = [];
  #initialized = false;

  async initialize(signal?: AbortSignal): Promise<void> {
    if (this.#initialized) {
      return;
    }

    const requestInit: RequestInit = signal === undefined ? {} : { signal };
    const manifestResponse = await fetch(
      withBookBasePath("/_book/search-index/index.json"),
      requestInit,
    );
    if (!manifestResponse.ok) {
      throw new Error(
        `Search manifest request failed: HTTP ${manifestResponse.status}`,
      );
    }

    const manifestEnvelope = assertEnvelope<SearchIndexManifest>(
      await manifestResponse.json(),
      "search-index/index.json",
    );
    const chunks = await Promise.all(
      manifestEnvelope.data.chunks.map(async (chunk) => {
        const response = await fetch(
          withBookBasePath(`/_book/search-index/${chunk.path}`),
          requestInit,
        );
        if (!response.ok) {
          throw new Error(
            `Search chunk request failed: HTTP ${response.status}`,
          );
        }
        return assertEnvelope<SearchChunk>(await response.json(), chunk.path)
          .data.records;
      }),
    );

    for (const records of chunks) {
      this.#records.push(...records);
    }
    this.#initialized = true;
  }

  query(input: string, limit: number): readonly SearchResult[] {
    const tokens = tokenizeQuery(input);
    if (tokens.length === 0 || limit <= 0) {
      return [];
    }

    return this.#records
      .map((record) => ({ record, score: scoreRecord(record, tokens) }))
      .filter((result) => Number.isFinite(result.score))
      .sort((left, right) => {
        const scoreOrder = right.score - left.score;
        return scoreOrder !== 0
          ? scoreOrder
          : left.record.recordId < right.record.recordId
            ? -1
            : left.record.recordId > right.record.recordId
              ? 1
              : 0;
      })
      .slice(0, limit);
  }
}
