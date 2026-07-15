import type {
  AssetReference,
  CompilerResult,
  Diagnostic,
  HeadingRecord,
  LinkKind,
  LinkPolicy,
  LinkRecord,
  SourceSpan,
} from "./model";

export interface UnresolvedLinkInput {
  readonly linkId: string;
  readonly sourceNodeId: string;
  readonly originalTarget: string;
  readonly sourceSpan: SourceSpan;
  readonly definitionTarget?: string;
  readonly kindHint?: "reference-definition" | "citation";
  readonly isAsset?: boolean;
}

export interface LinkResolutionDocumentInput {
  readonly documentId: string;
  readonly sourceId: string;
  readonly rootId: string;
  readonly normalizedPath: string;
  readonly route: string;
  readonly headings: readonly HeadingRecord[];
  readonly links: readonly UnresolvedLinkInput[];
}

export interface LinkResolutionAssetInput {
  readonly assetId: string;
  readonly sourceId: string;
  readonly rootId: string;
  readonly normalizedPath: string;
  readonly outputPath: string;
}

export interface LinkResolutionCompilation {
  readonly links: readonly LinkRecord[];
  readonly assets: readonly AssetReference[];
}

interface ParsedInternalTarget {
  readonly path: string;
  readonly query: string;
  readonly fragment?: string;
}

interface PathResolution {
  readonly ok: boolean;
  readonly path?: string;
  readonly traversedOutsideRoot: boolean;
}

function compareCodePoints(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizeCase(value: string, policy: LinkPolicy): string {
  return policy.caseSensitivity === "sensitive" ? value : value.toLowerCase();
}

function normalizedProtocol(protocol: string): string {
  return protocol.toLowerCase().replace(/:$/u, "");
}

function hasAllowedProtocol(protocol: string, policy: LinkPolicy): boolean {
  const target = normalizedProtocol(protocol);
  return policy.allowedProtocols.some(
    (allowed) => normalizedProtocol(allowed) === target,
  );
}

function parseInternalTarget(target: string): ParsedInternalTarget {
  const fragmentIndex = target.indexOf("#");
  const beforeFragment =
    fragmentIndex === -1 ? target : target.slice(0, fragmentIndex);
  const rawFragment =
    fragmentIndex === -1 ? undefined : target.slice(fragmentIndex + 1);
  const queryIndex = beforeFragment.indexOf("?");
  const path =
    queryIndex === -1 ? beforeFragment : beforeFragment.slice(0, queryIndex);
  const query = queryIndex === -1 ? "" : beforeFragment.slice(queryIndex);
  return {
    path,
    query,
    ...(rawFragment === undefined ? {} : { fragment: rawFragment }),
  };
}

function decodePathSegment(segment: string): string | undefined {
  try {
    const decoded = decodeURIComponent(segment);
    return decoded.includes("/") ||
      decoded.includes("\\") ||
      decoded.includes("\0")
      ? undefined
      : decoded;
  } catch {
    return undefined;
  }
}

function resolveSourceRelativePath(
  sourcePath: string,
  authoredPath: string,
): PathResolution {
  if (authoredPath.length === 0) {
    return {
      ok: true,
      path: sourcePath.replaceAll("\\", "/"),
      traversedOutsideRoot: false,
    };
  }
  const sourceSegments = sourcePath.replaceAll("\\", "/").split("/");
  sourceSegments.pop();
  const stack = authoredPath.startsWith("/")
    ? []
    : sourceSegments.filter(Boolean);
  let traversedOutsideRoot = false;

  for (const rawSegment of authoredPath.replaceAll("\\", "/").split("/")) {
    if (rawSegment.length === 0 || rawSegment === ".") {
      continue;
    }
    const segment = decodePathSegment(rawSegment);
    if (segment === undefined) {
      return { ok: false, traversedOutsideRoot };
    }
    if (segment === "..") {
      if (stack.length === 0) {
        traversedOutsideRoot = true;
      } else {
        stack.pop();
      }
      continue;
    }
    stack.push(segment);
  }

  return traversedOutsideRoot
    ? { ok: false, traversedOutsideRoot: true }
    : { ok: true, path: stack.join("/"), traversedOutsideRoot: false };
}

function pathWithoutExtension(path: string): string {
  const separator = path.lastIndexOf("/");
  const extension = path.lastIndexOf(".");
  return extension > separator ? path.slice(0, extension) : path;
}

function routeKey(route: string, policy: LinkPolicy): string {
  const withoutTrailing = route === "/" ? route : route.replace(/\/+$/u, "");
  return normalizeCase(withoutTrailing, policy);
}

function sourceKey(rootId: string, path: string, policy: LinkPolicy): string {
  return `${normalizeCase(rootId, policy)}\0${normalizeCase(path, policy)}`;
}

function decodedFragment(fragment: string): string | undefined {
  try {
    return decodeURIComponent(fragment);
  } catch {
    return undefined;
  }
}

function diagnosticSeverity(policy: LinkPolicy): "warning" | "error" {
  return policy.validateInternal && policy.failOnBroken ? "error" : "warning";
}

function unresolvedLink(
  document: LinkResolutionDocumentInput,
  input: UnresolvedLinkInput,
  kind: LinkKind,
  status: LinkRecord["status"],
): LinkRecord {
  return {
    linkId: input.linkId,
    sourceDocumentId: document.documentId,
    sourceNodeId: input.sourceNodeId,
    originalTarget: input.originalTarget,
    linkKind: kind,
    sourceSpan: input.sourceSpan,
    status,
  };
}

function assetReference(
  document: LinkResolutionDocumentInput,
  input: UnresolvedLinkInput,
  status: AssetReference["status"],
  asset?: LinkResolutionAssetInput,
): AssetReference {
  const base = {
    assetId: `asset-ref:${encodeURIComponent(document.documentId)}:${encodeURIComponent(input.linkId)}`,
    sourceDocumentId: document.documentId,
    sourceNodeId: input.sourceNodeId,
    originalTarget: input.originalTarget,
    status,
    sourceSpan: input.sourceSpan,
  };
  return asset === undefined
    ? base
    : {
        ...base,
        resolvedSourceId: asset.sourceId,
        outputPath: asset.outputPath,
      };
}

function resolveHeading(
  document: LinkResolutionDocumentInput,
  fragment: string,
  policy: LinkPolicy,
):
  | {
      readonly status: "valid";
      readonly heading: HeadingRecord;
      readonly caseMismatch: boolean;
    }
  | { readonly status: "broken" | "ambiguous" } {
  const decoded = decodedFragment(fragment);
  if (decoded === undefined || decoded.length === 0) {
    return { status: "broken" };
  }
  const normalized = normalizeCase(decoded, policy);
  const matches = document.headings.filter(
    (heading) => normalizeCase(heading.effectiveId, policy) === normalized,
  );
  if (matches.length === 0) {
    return { status: "broken" };
  }
  if (matches.length > 1) {
    return { status: "ambiguous" };
  }
  const heading = matches[0];
  return heading === undefined
    ? { status: "broken" }
    : {
        status: "valid",
        heading,
        caseMismatch: heading.effectiveId !== decoded,
      };
}

function hasErrors(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some(
    (diagnostic) =>
      diagnostic.severity === "error" || diagnostic.severity === "fatal",
  );
}

export function resolveLinks(
  documents: readonly LinkResolutionDocumentInput[],
  assetInputs: readonly LinkResolutionAssetInput[],
  policy: LinkPolicy,
): CompilerResult<LinkResolutionCompilation> {
  const diagnostics: Diagnostic[] = [];
  const links: LinkRecord[] = [];
  const assetReferences: AssetReference[] = [];
  const documentsByExactPath = new Map<string, LinkResolutionDocumentInput[]>();
  const documentsByStem = new Map<string, LinkResolutionDocumentInput[]>();
  const documentsByRoute = new Map<string, LinkResolutionDocumentInput[]>();
  const assetsByPath = new Map<string, LinkResolutionAssetInput[]>();

  for (const document of documents) {
    const exactKey = sourceKey(
      document.rootId,
      document.normalizedPath,
      policy,
    );
    const exactMatches = documentsByExactPath.get(exactKey) ?? [];
    exactMatches.push(document);
    documentsByExactPath.set(exactKey, exactMatches);

    const stemKey = sourceKey(
      document.rootId,
      pathWithoutExtension(document.normalizedPath),
      policy,
    );
    const stemMatches = documentsByStem.get(stemKey) ?? [];
    stemMatches.push(document);
    documentsByStem.set(stemKey, stemMatches);

    const routeMatches =
      documentsByRoute.get(routeKey(document.route, policy)) ?? [];
    routeMatches.push(document);
    documentsByRoute.set(routeKey(document.route, policy), routeMatches);
  }
  for (const asset of assetInputs) {
    const key = sourceKey(asset.rootId, asset.normalizedPath, policy);
    const matches = assetsByPath.get(key) ?? [];
    matches.push(asset);
    assetsByPath.set(key, matches);
  }

  const sortedDocuments = [...documents].sort((left, right) =>
    compareCodePoints(left.documentId, right.documentId),
  );
  const seenLinkIds = new Set<string>();
  for (const document of sortedDocuments) {
    const sortedInputs = [...document.links].sort((left, right) =>
      compareCodePoints(left.linkId, right.linkId),
    );
    for (const input of sortedInputs) {
      const globalLinkId = `${document.documentId}\0${input.linkId}`;
      if (seenLinkIds.has(globalLinkId)) {
        diagnostics.push({
          code: "LINK_ID_DUPLICATE",
          severity: "error",
          message: `Document '${document.documentId}' repeats link identifier '${input.linkId}'.`,
          phase: "link",
          sourceId: document.sourceId,
          sourceSpan: input.sourceSpan,
          nodeId: input.sourceNodeId,
        });
      }
      seenLinkIds.add(globalLinkId);

      const effectiveTarget = input.definitionTarget ?? input.originalTarget;
      if (input.kindHint === "citation") {
        links.push({
          linkId: input.linkId,
          sourceDocumentId: document.documentId,
          sourceNodeId: input.sourceNodeId,
          originalTarget: input.originalTarget,
          resolvedTarget: effectiveTarget,
          linkKind: "citation",
          sourceSpan: input.sourceSpan,
          status: "valid",
        });
        continue;
      }

      const schemeMatch = /^([a-z][a-z\d+.-]*):/iu.exec(effectiveTarget);
      if (schemeMatch !== null) {
        const protocol = schemeMatch[1] ?? "";
        const allowed = hasAllowedProtocol(protocol, policy);
        const kind: LinkKind =
          normalizedProtocol(protocol) === "mailto"
            ? "email"
            : ["http", "https"].includes(normalizedProtocol(protocol))
              ? "external"
              : "protocol-specific";
        links.push({
          linkId: input.linkId,
          sourceDocumentId: document.documentId,
          sourceNodeId: input.sourceNodeId,
          originalTarget: input.originalTarget,
          resolvedTarget: effectiveTarget,
          linkKind: input.kindHint ?? kind,
          sourceSpan: input.sourceSpan,
          status: allowed ? "valid" : "unsupported",
        });
        if (!allowed) {
          diagnostics.push({
            code: "LINK_PROTOCOL_UNSUPPORTED",
            severity: "error",
            message: `Protocol '${protocol}' is not allowed for link '${input.originalTarget}'.`,
            phase: "link",
            sourceId: document.sourceId,
            sourceSpan: input.sourceSpan,
            nodeId: input.sourceNodeId,
            remediation: "Use a protocol explicitly allowed by link policy.",
          });
        }
        continue;
      }

      if (effectiveTarget.startsWith("//")) {
        const allowed = hasAllowedProtocol("https", policy);
        links.push({
          linkId: input.linkId,
          sourceDocumentId: document.documentId,
          sourceNodeId: input.sourceNodeId,
          originalTarget: input.originalTarget,
          resolvedTarget: effectiveTarget,
          linkKind: "external",
          sourceSpan: input.sourceSpan,
          status: allowed ? "valid" : "unsupported",
        });
        if (!allowed) {
          diagnostics.push({
            code: "LINK_PROTOCOL_UNSUPPORTED",
            severity: "error",
            message: `Protocol-relative URL '${input.originalTarget}' is not allowed.`,
            phase: "link",
            sourceId: document.sourceId,
            sourceSpan: input.sourceSpan,
            nodeId: input.sourceNodeId,
          });
        }
        continue;
      }

      const parsed = parseInternalTarget(effectiveTarget);
      const pathResolution = resolveSourceRelativePath(
        document.normalizedPath,
        parsed.path,
      );
      if (!pathResolution.ok || pathResolution.path === undefined) {
        const severity =
          policy.invalidTraversal === "error"
            ? "error"
            : diagnosticSeverity(policy);
        diagnostics.push({
          code: pathResolution.traversedOutsideRoot
            ? "LINK_PATH_TRAVERSAL"
            : "LINK_TARGET_ENCODING_INVALID",
          severity,
          message: `Internal target '${input.originalTarget}' cannot be resolved safely.`,
          phase: "link",
          sourceId: document.sourceId,
          sourceSpan: input.sourceSpan,
          nodeId: input.sourceNodeId,
          remediation:
            "Use a valid source-relative path that remains inside its content root.",
        });
        const unresolved = unresolvedLink(
          document,
          input,
          input.isAsset === true ? "asset" : "unresolved",
          "unsupported",
        );
        links.push(unresolved);
        if (input.isAsset === true) {
          assetReferences.push(assetReference(document, input, "unsupported"));
        }
        continue;
      }

      const exactKey = sourceKey(document.rootId, pathResolution.path, policy);
      const exactDocuments = documentsByExactPath.get(exactKey) ?? [];
      const stemDocuments = documentsByStem.get(exactKey) ?? [];
      const sourceDocumentMatches =
        exactDocuments.length > 0 ? exactDocuments : stemDocuments;
      const routePath = parsed.path.startsWith("/")
        ? parsed.path
        : `/${parsed.path}`;
      const routeMatches =
        documentsByRoute.get(routeKey(routePath, policy)) ?? [];
      const documentMatches =
        sourceDocumentMatches.length > 0 ? sourceDocumentMatches : routeMatches;
      const assetMatches = assetsByPath.get(exactKey) ?? [];

      if (
        input.isAsset === true ||
        (documentMatches.length === 0 && assetMatches.length > 0)
      ) {
        if (assetMatches.length !== 1) {
          const status = assetMatches.length === 0 ? "broken" : "ambiguous";
          links.push(unresolvedLink(document, input, "asset", status));
          assetReferences.push(assetReference(document, input, status));
          diagnostics.push({
            code:
              status === "broken"
                ? "ASSET_LINK_BROKEN"
                : "ASSET_LINK_AMBIGUOUS",
            severity: diagnosticSeverity(policy),
            message: `Asset target '${input.originalTarget}' is ${status}.`,
            phase: "link",
            sourceId: document.sourceId,
            sourceSpan: input.sourceSpan,
            nodeId: input.sourceNodeId,
          });
          continue;
        }
        const asset = assetMatches[0];
        if (asset === undefined) {
          continue;
        }
        links.push({
          linkId: input.linkId,
          sourceDocumentId: document.documentId,
          sourceNodeId: input.sourceNodeId,
          originalTarget: input.originalTarget,
          resolvedTarget: asset.normalizedPath,
          rewrittenTarget: `${asset.outputPath}${parsed.query}${
            parsed.fragment === undefined ? "" : `#${parsed.fragment}`
          }`,
          linkKind: "asset",
          sourceSpan: input.sourceSpan,
          status: "valid",
        });
        assetReferences.push(assetReference(document, input, "valid", asset));
        continue;
      }

      if (documentMatches.length !== 1) {
        const status = documentMatches.length === 0 ? "broken" : "ambiguous";
        links.push(
          unresolvedLink(
            document,
            input,
            parsed.fragment === undefined
              ? "internal-document"
              : "internal-heading",
            status,
          ),
        );
        diagnostics.push({
          code:
            status === "broken"
              ? "LINK_INTERNAL_BROKEN"
              : "LINK_INTERNAL_AMBIGUOUS",
          severity: diagnosticSeverity(policy),
          message: `Internal target '${input.originalTarget}' is ${status}.`,
          phase: "link",
          sourceId: document.sourceId,
          sourceSpan: input.sourceSpan,
          nodeId: input.sourceNodeId,
          remediation:
            "Reference one unique source document and an existing heading.",
        });
        continue;
      }

      const targetDocument = documentMatches[0];
      if (targetDocument === undefined) {
        continue;
      }
      let headingSuffix = "";
      let headingId: string | undefined;
      if (parsed.fragment !== undefined) {
        const heading = resolveHeading(targetDocument, parsed.fragment, policy);
        if (heading.status !== "valid") {
          links.push(
            unresolvedLink(document, input, "internal-heading", heading.status),
          );
          diagnostics.push({
            code:
              heading.status === "broken"
                ? "LINK_HEADING_BROKEN"
                : "LINK_HEADING_AMBIGUOUS",
            severity: diagnosticSeverity(policy),
            message: `Heading fragment '#${parsed.fragment}' is ${heading.status} in '${targetDocument.documentId}'.`,
            phase: "link",
            sourceId: document.sourceId,
            sourceSpan: input.sourceSpan,
            nodeId: input.sourceNodeId,
          });
          continue;
        }
        headingId = heading.heading.effectiveId;
        headingSuffix = `#${encodeURIComponent(headingId)}`;
        if (heading.caseMismatch) {
          diagnostics.push({
            code: "LINK_HEADING_CASE_MISMATCH",
            severity: "warning",
            message: `Fragment '#${parsed.fragment}' differs in case from '#${headingId}'.`,
            phase: "link",
            sourceId: document.sourceId,
            sourceSpan: input.sourceSpan,
            nodeId: input.sourceNodeId,
          });
        }
      }

      if (
        policy.caseSensitivity === "insensitive" &&
        pathResolution.path !== targetDocument.normalizedPath &&
        normalizeCase(pathResolution.path, policy) ===
          normalizeCase(targetDocument.normalizedPath, policy)
      ) {
        diagnostics.push({
          code: "LINK_DOCUMENT_CASE_MISMATCH",
          severity: "warning",
          message: `Target path '${pathResolution.path}' differs in case from '${targetDocument.normalizedPath}'.`,
          phase: "link",
          sourceId: document.sourceId,
          sourceSpan: input.sourceSpan,
          nodeId: input.sourceNodeId,
        });
      }

      links.push({
        linkId: input.linkId,
        sourceDocumentId: document.documentId,
        sourceNodeId: input.sourceNodeId,
        originalTarget: input.originalTarget,
        resolvedTarget: `${targetDocument.normalizedPath}${headingId === undefined ? "" : `#${headingId}`}`,
        rewrittenTarget: `${targetDocument.route}${parsed.query}${headingSuffix}`,
        targetDocumentId: targetDocument.documentId,
        linkKind:
          input.kindHint ??
          (parsed.fragment === undefined
            ? "internal-document"
            : "internal-heading"),
        sourceSpan: input.sourceSpan,
        status: "valid",
      });
    }
  }

  return hasErrors(diagnostics)
    ? { ok: false, diagnostics }
    : {
        ok: true,
        value: { links, assets: assetReferences },
        diagnostics,
      };
}
