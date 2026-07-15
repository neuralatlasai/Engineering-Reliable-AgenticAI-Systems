import { describe, expect, it } from "vitest";

import { hashBookCompilerConfig } from "../../src/compiler/config";
import {
  defineBookConfig,
  validateBookCompilerConfig,
} from "../../src/compiler/config";
import { DIAGNOSTIC_CODES } from "../../src/compiler/diagnostics";

describe("book compiler configuration", () => {
  it("resolves documented defaults and validates the resulting contract", () => {
    const config = defineBookConfig({
      corpusId: "reliable-agents",
      contentRoots: [{ id: "main", path: "content", trustLevel: "reviewed" }],
    });

    const result = validateBookCompilerConfig(config);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.parserPolicy.extensionAdapters[".md"]).toBe(
        "commonmark",
      );
      expect(result.value.discoveryPolicy.sourceIdStrategy).toBe("path");
      expect(result.value.outputPolicy.reproducibleTimestamp).toBe(
        "1970-01-01T00:00:00.000Z",
      );
    }
  });

  it("reports stable codes for duplicate roots and rejects unknown keys", () => {
    const config = defineBookConfig({
      corpusId: "duplicates",
      contentRoots: [
        { id: "root", path: "content", trustLevel: "reviewed" },
        { id: "root", path: "content", trustLevel: "untrusted" },
      ],
    });

    const result = validateBookCompilerConfig(config);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      const codes = new Set(
        result.diagnostics.map((diagnostic) => diagnostic.code),
      );
      expect(codes).toContain(DIAGNOSTIC_CODES.CONFIG_DUPLICATE_ROOT_ID);
      expect(codes).toContain(DIAGNOSTIC_CODES.CONFIG_DUPLICATE_ROOT_PATH);
    }

    const unknownKeyResult = validateBookCompilerConfig({
      ...defineBookConfig({
        corpusId: "unknown-key",
        contentRoots: [{ id: "root", path: "content", trustLevel: "reviewed" }],
      }),
      undocumentedOption: true,
    });
    expect(unknownKeyResult.ok).toBe(false);
    if (!unknownKeyResult.ok) {
      expect(
        unknownKeyResult.diagnostics.map((diagnostic) => diagnostic.code),
      ).toContain(DIAGNOSTIC_CODES.CONFIG_INVALID);
    }
  });

  it("hashes semantically identical configuration independently of object key order", () => {
    const config = defineBookConfig({
      corpusId: "canonical",
      contentRoots: [
        { id: "main", path: "content", trustLevel: "trusted-static" },
      ],
      parserPolicy: {
        encodingOverrides: {
          "legacy/**": "windows-1252",
          "modern/**": "utf-8",
        },
      },
    });
    const reordered = {
      ...config,
      parserPolicy: {
        ...config.parserPolicy,
        encodingOverrides: {
          "modern/**": "utf-8",
          "legacy/**": "windows-1252",
        },
      },
    };

    expect(hashBookCompilerConfig(config)).toBe(
      hashBookCompilerConfig(reordered),
    );
  });
});
