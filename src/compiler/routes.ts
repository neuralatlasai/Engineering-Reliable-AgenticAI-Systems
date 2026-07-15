import type {
  CompilerResult,
  DerivationStep,
  Diagnostic,
  ResolvedValue,
  RoutePolicy,
  RouteRecord,
  ValueOrigin,
} from "./model";

export interface RouteDocumentInput {
  readonly documentId: string;
  readonly sourceId: string;
  readonly normalizedPath: string;
  readonly explicitRoute?: ResolvedValue<string>;
  readonly slug?: ResolvedValue<string>;
  readonly hierarchySegments?: readonly string[];
  readonly aliases?: ResolvedValue<readonly string[]>;
  readonly redirectsFrom?: readonly string[];
}

interface RouteCandidate {
  readonly value: string;
  readonly origin: ValueOrigin;
  readonly rule: string;
  readonly evidence: string;
}

interface RouteClaim {
  readonly documentId: string;
  readonly kind: "canonical" | "alias" | "redirect";
  readonly authored: string;
}

function compareCodePoints(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function routeKey(route: string): string {
  return route === "/" ? route : route.replace(/\/+$/u, "");
}

function prefixSegments(policy: RoutePolicy): readonly string[] {
  return [
    policy.routePrefix,
    policy.localePrefix,
    policy.volumePrefix,
    policy.versionPrefix,
  ].flatMap((value) =>
    value === undefined
      ? []
      : value
          .replaceAll("\\", "/")
          .split("/")
          .filter((segment) => segment.length > 0),
  );
}

function encodeSegment(
  segment: string,
  policy: RoutePolicy,
): { readonly ok: true; readonly value: string } | { readonly ok: false } {
  let decoded: string;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    return { ok: false };
  }

  if (
    decoded.length === 0 ||
    decoded === "." ||
    decoded === ".." ||
    decoded.includes("/") ||
    decoded.includes("\\") ||
    decoded.includes("\0")
  ) {
    return { ok: false };
  }

  const canonical = policy.lowercase ? decoded.toLowerCase() : decoded;
  return { ok: true, value: encodeURIComponent(canonical) };
}

function normalizeRouteBody(
  authored: string,
  policy: RoutePolicy,
):
  | { readonly ok: true; readonly segments: readonly string[] }
  | { readonly ok: false } {
  if (
    authored.includes("?") ||
    authored.includes("#") ||
    /^[a-z][a-z\d+.-]*:/iu.test(authored)
  ) {
    return { ok: false };
  }

  const rawSegments = authored
    .replaceAll("\\", "/")
    .split("/")
    .filter((segment) => segment.length > 0);
  const segments: string[] = [];
  for (const rawSegment of rawSegments) {
    const segment = encodeSegment(rawSegment, policy);
    if (!segment.ok) {
      return { ok: false };
    }
    segments.push(segment.value);
  }
  return { ok: true, segments };
}

function assembleRoute(
  authoredBody: string,
  policy: RoutePolicy,
): { readonly ok: true; readonly value: string } | { readonly ok: false } {
  const prefix = normalizeRouteBody(prefixSegments(policy).join("/"), policy);
  const body = normalizeRouteBody(authoredBody, policy);
  if (!prefix.ok || !body.ok) {
    return { ok: false };
  }

  // A literal leading slash is the explicit opt-out from configured prefixes.
  // Derived paths and slugs never begin with a slash, so their prefix semantics
  // cannot change because of source filenames or numeric naming conventions.
  const segments = authoredBody.startsWith("/")
    ? body.segments
    : [...prefix.segments, ...body.segments];
  const joined = segments.join("/");
  const route = joined.length === 0 ? "/" : `/${joined}`;
  return {
    ok: true,
    value: policy.trailingSlash && route !== "/" ? `${route}/` : route,
  };
}

function pathDerivedBody(normalizedPath: string): string {
  const segments = normalizedPath
    .replaceAll("\\", "/")
    .split("/")
    .filter((segment) => segment.length > 0);
  const filename = segments.at(-1);
  if (filename === undefined) {
    return "";
  }
  const extensionIndex = filename.lastIndexOf(".");
  const stem =
    extensionIndex > 0 ? filename.slice(0, extensionIndex) : filename;
  return [...segments.slice(0, -1), stem].join("/");
}

function configuredRoute(
  document: RouteDocumentInput,
  policy: RoutePolicy,
  diagnostics: Diagnostic[],
): string | undefined {
  const values = [
    policy.explicitRoutes[document.documentId],
    policy.explicitRoutes[document.sourceId],
    policy.explicitRoutes[document.normalizedPath],
  ].filter((value): value is string => value !== undefined);
  const uniqueValues = [...new Set(values)];
  if (uniqueValues.length > 1) {
    diagnostics.push({
      code: "ROUTE_CONFIGURATION_CONFLICT",
      severity: "error",
      message: `Document '${document.documentId}' has conflicting configured routes: ${uniqueValues.join(", ")}.`,
      phase: "route",
      sourceId: document.sourceId,
      nodeId: document.documentId,
      remediation: "Configure one route for every equivalent document key.",
    });
  }
  return uniqueValues[0];
}

function routeCandidates(
  document: RouteDocumentInput,
  policy: RoutePolicy,
  diagnostics: Diagnostic[],
): readonly RouteCandidate[] {
  const candidates: RouteCandidate[] = [];
  const configured = configuredRoute(document, policy, diagnostics);
  if (configured !== undefined) {
    candidates.push({
      value: configured,
      origin: "configuration",
      rule: "route.explicit-configuration",
      evidence: `routePolicy.explicitRoutes for '${document.documentId}'`,
    });
  }
  if (document.explicitRoute !== undefined) {
    candidates.push({
      value: document.explicitRoute.value,
      origin: document.explicitRoute.origin,
      rule: "route.resolved-metadata",
      evidence: `resolved route metadata for '${document.documentId}'`,
    });
  }
  if (document.slug !== undefined) {
    if (
      document.slug.value.includes("/") ||
      document.slug.value.includes("\\")
    ) {
      diagnostics.push({
        code: "ROUTE_SLUG_INVALID",
        severity: "error",
        message: `Slug for '${document.documentId}' must be one path segment.`,
        phase: "route",
        sourceId: document.sourceId,
        nodeId: document.documentId,
        remediation:
          "Use an explicit route when multiple path segments are required.",
      });
    } else {
      candidates.push({
        value: [
          ...(document.hierarchySegments ?? []),
          document.slug.value,
        ].join("/"),
        origin: document.slug.origin,
        rule: "route.explicit-slug",
        evidence: `resolved slug and configured hierarchy for '${document.documentId}'`,
      });
    }
  }

  candidates.push({
    value: pathDerivedBody(document.normalizedPath),
    origin: "derived",
    rule: "route.source-path",
    evidence: `unmodified source path '${document.normalizedPath}' with only its extension removed`,
  });
  return candidates;
}

function derivationTrace(
  candidates: readonly RouteCandidate[],
  canonicalRoute: string,
): readonly DerivationStep[] {
  return candidates.map((candidate, index) => ({
    rule: candidate.rule,
    evidence: [candidate.evidence],
    result: index === 0 ? canonicalRoute : candidate.value,
    precedence: index,
    overriddenAlternatives: candidates
      .filter((alternative) => alternative !== candidate)
      .map((alternative) => `${alternative.origin}:${alternative.value}`),
    validationOutcome: index === 0 ? "accepted" : "rejected",
  }));
}

function normalizeAdditionalRoutes(
  authoredRoutes: readonly string[],
  kind: "alias" | "redirect",
  document: RouteDocumentInput,
  policy: RoutePolicy,
  diagnostics: Diagnostic[],
): readonly string[] {
  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const authored of authoredRoutes) {
    const route = assembleRoute(authored, policy);
    if (!route.ok) {
      diagnostics.push({
        code: "ROUTE_VALUE_INVALID",
        severity: "error",
        message: `${kind === "alias" ? "Alias" : "Redirect"} '${authored}' for '${document.documentId}' is invalid.`,
        phase: "route",
        sourceId: document.sourceId,
        nodeId: document.documentId,
        remediation:
          "Use a traversal-free URL path without a query, fragment, or protocol.",
      });
      continue;
    }
    const key = routeKey(route.value);
    if (seen.has(key)) {
      diagnostics.push({
        code: "ROUTE_DUPLICATE_DOCUMENT_CLAIM",
        severity: "error",
        message: `Document '${document.documentId}' repeats normalized ${kind} route '${route.value}'.`,
        phase: "route",
        sourceId: document.sourceId,
        nodeId: document.documentId,
      });
      continue;
    }
    seen.add(key);
    normalized.push(route.value);
  }
  return normalized;
}

function reservedRouteKeys(policy: RoutePolicy): ReadonlySet<string> {
  const keys = new Set<string>();
  for (const reserved of policy.reservedRoutes) {
    const direct = normalizeRouteBody(reserved, policy);
    if (direct.ok) {
      const value =
        direct.segments.length === 0 ? "/" : `/${direct.segments.join("/")}`;
      keys.add(routeKey(value));
    }
    const prefixed = assembleRoute(reserved, policy);
    if (prefixed.ok) {
      keys.add(routeKey(prefixed.value));
    }
  }
  return keys;
}

function hasErrors(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some(
    (diagnostic) =>
      diagnostic.severity === "error" || diagnostic.severity === "fatal",
  );
}

export function compileRoutes(
  documents: readonly RouteDocumentInput[],
  policy: RoutePolicy,
): CompilerResult<readonly RouteRecord[]> {
  const diagnostics: Diagnostic[] = [];
  const records: RouteRecord[] = [];
  const claims = new Map<string, RouteClaim>();
  const reserved = reservedRouteKeys(policy);
  const sortedDocuments = [...documents].sort((left, right) =>
    compareCodePoints(left.documentId, right.documentId),
  );

  for (let index = 1; index < sortedDocuments.length; index += 1) {
    const duplicateId = sortedDocuments[index]?.documentId;
    if (
      duplicateId !== undefined &&
      sortedDocuments[index - 1]?.documentId === duplicateId
    ) {
      diagnostics.push({
        code: "ROUTE_DOCUMENT_ID_DUPLICATE",
        severity: "error",
        message: `Route input repeats document '${duplicateId}'.`,
        phase: "route",
        nodeId: duplicateId,
      });
    }
  }

  for (const document of sortedDocuments) {
    const candidates = routeCandidates(document, policy, diagnostics);
    const selected = candidates[0];
    if (selected === undefined) {
      diagnostics.push({
        code: "ROUTE_CANDIDATE_MISSING",
        severity: "error",
        message: `No route can be derived for '${document.documentId}'.`,
        phase: "route",
        sourceId: document.sourceId,
        nodeId: document.documentId,
      });
      continue;
    }
    const canonical = assembleRoute(selected.value, policy);
    if (!canonical.ok) {
      diagnostics.push({
        code: "ROUTE_CANONICAL_INVALID",
        severity: "error",
        message: `Canonical route candidate '${selected.value}' for '${document.documentId}' is invalid.`,
        phase: "route",
        sourceId: document.sourceId,
        nodeId: document.documentId,
        remediation:
          "Use a traversal-free URL path without a query, fragment, or protocol.",
      });
      continue;
    }

    const aliases = normalizeAdditionalRoutes(
      document.aliases?.value ?? [],
      "alias",
      document,
      policy,
      diagnostics,
    );
    const redirects = normalizeAdditionalRoutes(
      document.redirectsFrom ?? [],
      "redirect",
      document,
      policy,
      diagnostics,
    );
    records.push({
      documentId: document.documentId,
      canonicalRoute: canonical.value,
      aliases,
      redirectsFrom: redirects,
      origin: selected.origin,
      derivationTrace: derivationTrace(candidates, canonical.value),
    });

    const documentClaims: readonly {
      readonly route: string;
      readonly kind: RouteClaim["kind"];
      readonly authored: string;
    }[] = [
      { route: canonical.value, kind: "canonical", authored: selected.value },
      ...aliases.map((route) => ({
        route,
        kind: "alias" as const,
        authored: route,
      })),
      ...redirects.map((route) => ({
        route,
        kind: "redirect" as const,
        authored: route,
      })),
    ];
    const localClaims = new Set<string>();
    for (const claim of documentClaims) {
      const key = routeKey(claim.route);
      if (reserved.has(key)) {
        diagnostics.push({
          code: "ROUTE_RESERVED",
          severity: "error",
          message: `${claim.kind} route '${claim.route}' for '${document.documentId}' is reserved.`,
          phase: "route",
          sourceId: document.sourceId,
          nodeId: document.documentId,
          remediation:
            "Choose a route outside the configured reserved route set.",
        });
      }

      if (localClaims.has(key)) {
        diagnostics.push({
          code: "ROUTE_DUPLICATE_DOCUMENT_CLAIM",
          severity: "error",
          message: `Document '${document.documentId}' claims '${claim.route}' more than once after normalization.`,
          phase: "route",
          sourceId: document.sourceId,
          nodeId: document.documentId,
        });
        continue;
      }
      localClaims.add(key);

      const existing = claims.get(key);
      if (existing !== undefined) {
        diagnostics.push({
          code: "ROUTE_COLLISION",
          severity: "error",
          message: `Route '${claim.route}' is claimed by '${existing.documentId}' (${existing.kind}) and '${document.documentId}' (${claim.kind}).`,
          phase: "route",
          sourceId: document.sourceId,
          nodeId: document.documentId,
          related: [
            {
              sourceId: existing.documentId,
              message: `Existing ${existing.kind} claim authored as '${existing.authored}'`,
            },
          ],
          remediation: "Assign unique canonical, alias, and redirect paths.",
        });
      } else {
        claims.set(key, {
          documentId: document.documentId,
          kind: claim.kind,
          authored: claim.authored,
        });
      }
    }
  }

  return hasErrors(diagnostics)
    ? { ok: false, diagnostics }
    : { ok: true, value: records, diagnostics };
}
