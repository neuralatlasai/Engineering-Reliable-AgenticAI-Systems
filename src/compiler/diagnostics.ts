import type { Diagnostic } from "./model";

export const DIAGNOSTIC_CODES = {
  CONFIG_INVALID: "CFG001",
  CONFIG_DUPLICATE_ROOT_ID: "CFG002",
  CONFIG_DUPLICATE_ROOT_PATH: "CFG003",
  CONFIG_UNSAFE_RECORD_KEY: "CFG004",
  CONFIG_AMBIGUOUS_EXTENSION: "CFG005",
  CONFIG_INVALID_GLOB: "CFG006",
  SOURCE_ROOT_NOT_FOUND: "SRC001",
  SOURCE_ROOT_NOT_DIRECTORY: "SRC002",
  SOURCE_ROOT_UNREADABLE: "SRC003",
  SOURCE_ENTRY_UNREADABLE: "SRC004",
  SOURCE_SYMLINK_CYCLE: "SRC005",
  SOURCE_SYMLINK_IGNORED: "SRC006",
  SOURCE_FILE_TOO_LARGE: "SRC007",
  SOURCE_FILE_CHANGED_DURING_READ: "SRC008",
  SOURCE_READ_FAILED: "SRC009",
  SOURCE_UNSUPPORTED_ENCODING: "SRC010",
  SOURCE_INVALID_ENCODING: "SRC011",
  SOURCE_ENCODING_BOM_CONFLICT: "SRC012",
  SOURCE_UNSUPPORTED_BOM: "SRC013",
  SOURCE_DUPLICATE_PHYSICAL_FILE: "SRC014",
  SOURCE_DUPLICATE_LOGICAL_PATH: "SRC015",
  SOURCE_DUPLICATE_ID: "SRC016",
  SOURCE_CASE_COLLISION: "SRC017",
} as const;

export type DiagnosticCode =
  (typeof DIAGNOSTIC_CODES)[keyof typeof DIAGNOSTIC_CODES];

export interface DiagnosticCodeDocumentation {
  readonly summary: string;
  readonly defaultSeverity: Diagnostic["severity"];
  readonly phase: Diagnostic["phase"];
  readonly stability: "stable";
}

// Codes are append-only public compiler API. Existing meanings must never be
// repurposed; obsolete codes remain reserved for artifact compatibility.
export const DIAGNOSTIC_CODE_DOCUMENTATION = {
  CFG001: {
    summary: "Configuration input does not satisfy the typed compiler schema.",
    defaultSeverity: "fatal",
    phase: "source",
    stability: "stable",
  },
  CFG002: {
    summary: "Two content roots declare the same logical root identifier.",
    defaultSeverity: "fatal",
    phase: "source",
    stability: "stable",
  },
  CFG003: {
    summary: "Two content roots resolve to the same configured root path.",
    defaultSeverity: "fatal",
    phase: "source",
    stability: "stable",
  },
  CFG004: {
    summary:
      "A configuration record contains a prototype-pollution-sensitive key.",
    defaultSeverity: "fatal",
    phase: "source",
    stability: "stable",
  },
  CFG005: {
    summary: "One extension is configured as both a document and an asset.",
    defaultSeverity: "fatal",
    phase: "source",
    stability: "stable",
  },
  CFG006: {
    summary:
      "An include, exclude, or encoding-override glob cannot be compiled.",
    defaultSeverity: "fatal",
    phase: "source",
    stability: "stable",
  },
  SRC001: {
    summary: "A configured content root does not exist.",
    defaultSeverity: "fatal",
    phase: "source",
    stability: "stable",
  },
  SRC002: {
    summary: "A configured content root is not a directory.",
    defaultSeverity: "fatal",
    phase: "source",
    stability: "stable",
  },
  SRC003: {
    summary: "A configured content root cannot be inspected or enumerated.",
    defaultSeverity: "fatal",
    phase: "source",
    stability: "stable",
  },
  SRC004: {
    summary: "A filesystem entry cannot be inspected during discovery.",
    defaultSeverity: "fatal",
    phase: "source",
    stability: "stable",
  },
  SRC005: {
    summary:
      "Following a symbolic directory link would create a traversal cycle.",
    defaultSeverity: "warning",
    phase: "source",
    stability: "stable",
  },
  SRC006: {
    summary:
      "A symbolic link is excluded by the configured symbolic-link policy.",
    defaultSeverity: "info",
    phase: "source",
    stability: "stable",
  },
  SRC007: {
    summary: "A source exceeds validationPolicy.maxSourceBytes.",
    defaultSeverity: "fatal",
    phase: "source",
    stability: "stable",
  },
  SRC008: {
    summary:
      "A source changed between filesystem inspection and bounded reading.",
    defaultSeverity: "fatal",
    phase: "source",
    stability: "stable",
  },
  SRC009: {
    summary: "A source cannot be opened or read completely.",
    defaultSeverity: "fatal",
    phase: "source",
    stability: "stable",
  },
  SRC010: {
    summary: "The selected text encoding is not supported by the decoder.",
    defaultSeverity: "fatal",
    phase: "source",
    stability: "stable",
  },
  SRC011: {
    summary:
      "Document bytes are not valid or exactly round-trippable in the selected encoding.",
    defaultSeverity: "fatal",
    phase: "source",
    stability: "stable",
  },
  SRC012: {
    summary:
      "A byte-order mark overrides a conflicting configured text encoding.",
    defaultSeverity: "warning",
    phase: "source",
    stability: "stable",
  },
  SRC013: {
    summary:
      "A recognized byte-order mark cannot be represented by the source model.",
    defaultSeverity: "fatal",
    phase: "source",
    stability: "stable",
  },
  SRC014: {
    summary:
      "Multiple logical entries resolve to the same physical filesystem object.",
    defaultSeverity: "fatal",
    phase: "source",
    stability: "stable",
  },
  SRC015: {
    summary:
      "Multiple sources occupy the same normalized root-relative logical path.",
    defaultSeverity: "fatal",
    phase: "source",
    stability: "stable",
  },
  SRC016: {
    summary:
      "The configured source identifier strategy produced a duplicate identifier.",
    defaultSeverity: "fatal",
    phase: "source",
    stability: "stable",
  },
  SRC017: {
    summary:
      "Distinct path spellings collide under case-insensitive discovery.",
    defaultSeverity: "fatal",
    phase: "source",
    stability: "stable",
  },
} as const satisfies Record<DiagnosticCode, DiagnosticCodeDocumentation>;

const SEVERITY_RANK: Readonly<Record<Diagnostic["severity"], number>> = {
  info: 0,
  warning: 1,
  error: 2,
  fatal: 3,
};

export interface DiagnosticInput extends Omit<
  Diagnostic,
  "code" | "phase" | "severity"
> {
  readonly code: DiagnosticCode;
  readonly phase?: Diagnostic["phase"];
  readonly severity?: Diagnostic["severity"];
}

export function createDiagnostic(input: DiagnosticInput): Diagnostic {
  const documentation = DIAGNOSTIC_CODE_DOCUMENTATION[input.code];

  return {
    ...input,
    code: input.code,
    phase: input.phase ?? documentation.phase,
    severity: input.severity ?? documentation.defaultSeverity,
  };
}

function compareOptionalStrings(
  left: string | undefined,
  right: string | undefined,
): number {
  if (left === right) {
    return 0;
  }
  if (left === undefined) {
    return -1;
  }
  if (right === undefined) {
    return 1;
  }
  return left < right ? -1 : left > right ? 1 : 0;
}

export function compareDiagnostics(
  left: Diagnostic,
  right: Diagnostic,
): number {
  const phase = compareOptionalStrings(left.phase, right.phase);
  if (phase !== 0) {
    return phase;
  }

  const source = compareOptionalStrings(left.sourceId, right.sourceId);
  if (source !== 0) {
    return source;
  }

  const code = compareOptionalStrings(left.code, right.code);
  if (code !== 0) {
    return code;
  }

  const severity = SEVERITY_RANK[right.severity] - SEVERITY_RANK[left.severity];
  if (severity !== 0) {
    return severity;
  }

  return compareOptionalStrings(left.message, right.message);
}

export function sortDiagnostics(
  diagnostics: readonly Diagnostic[],
): readonly Diagnostic[] {
  return [...diagnostics].sort(compareDiagnostics);
}

export function hasDiagnosticsAtOrAbove(
  diagnostics: readonly Diagnostic[],
  threshold: Diagnostic["severity"],
): boolean {
  const minimumRank = SEVERITY_RANK[threshold];
  return diagnostics.some(
    (diagnostic) => SEVERITY_RANK[diagnostic.severity] >= minimumRank,
  );
}

export function hasFatalDiagnostics(
  diagnostics: readonly Diagnostic[],
): boolean {
  return hasDiagnosticsAtOrAbove(diagnostics, "fatal");
}
