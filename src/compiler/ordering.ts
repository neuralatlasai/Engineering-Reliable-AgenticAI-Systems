import type {
  CompilerResult,
  ContentNode,
  Diagnostic,
  OrderKey,
  OrderingComparator,
  OrderingPolicy,
  ResolvedValue,
  ValueOrigin,
} from "./model";

export interface OrderKeyInput {
  readonly nodeId: string;
  readonly normalizedPath: string;
  readonly sourceId: string;
  readonly explicitOrder?: ResolvedValue<string | number>;
  readonly manifestOrder?: string | number;
  readonly chapterSection?: string | number;
  readonly chapterSectionOrigin?: ValueOrigin;
  readonly sourceDiscoveryOrder?: number;
}

export interface OrderedNode {
  readonly nodeId: string;
  readonly orderKey: OrderKey;
}

function compareCodePoints(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizeCase(value: string, policy: OrderingPolicy): string {
  if (policy.caseSensitivity === "sensitive") {
    return value;
  }

  return policy.locale === undefined
    ? value.toLowerCase()
    : value.toLocaleLowerCase(policy.locale);
}

function compareDigitRuns(left: string, right: string): number {
  const normalizedLeft = left.replace(/^0+(?=\d)/u, "");
  const normalizedRight = right.replace(/^0+(?=\d)/u, "");

  if (normalizedLeft.length !== normalizedRight.length) {
    return normalizedLeft.length - normalizedRight.length;
  }

  const valueOrder = compareCodePoints(normalizedLeft, normalizedRight);
  if (valueOrder !== 0) {
    return valueOrder;
  }

  // Equal numeric values retain a deterministic authored-text distinction.
  return left.length - right.length;
}

export function compareNaturalStrings(
  leftInput: string,
  rightInput: string,
  policy: Pick<OrderingPolicy, "caseSensitivity" | "locale" | "numeric">,
): number {
  const left =
    policy.caseSensitivity === "sensitive"
      ? leftInput
      : policy.locale === undefined
        ? leftInput.toLowerCase()
        : leftInput.toLocaleLowerCase(policy.locale);
  const right =
    policy.caseSensitivity === "sensitive"
      ? rightInput
      : policy.locale === undefined
        ? rightInput.toLowerCase()
        : rightInput.toLocaleLowerCase(policy.locale);

  if (!policy.numeric) {
    const normalizedOrder = compareCodePoints(left, right);
    return normalizedOrder !== 0
      ? normalizedOrder
      : compareCodePoints(leftInput, rightInput);
  }

  const leftRuns = left.match(/\d+|\D+/gu) ?? [];
  const rightRuns = right.match(/\d+|\D+/gu) ?? [];
  const sharedLength = Math.min(leftRuns.length, rightRuns.length);

  for (let index = 0; index < sharedLength; index += 1) {
    const leftRun = leftRuns[index];
    const rightRun = rightRuns[index];
    if (
      leftRun === undefined ||
      rightRun === undefined ||
      leftRun === rightRun
    ) {
      continue;
    }

    const leftIsDigits = /^\d+$/u.test(leftRun);
    const rightIsDigits = /^\d+$/u.test(rightRun);
    const runOrder =
      leftIsDigits && rightIsDigits
        ? compareDigitRuns(leftRun, rightRun)
        : compareCodePoints(leftRun, rightRun);
    if (runOrder !== 0) {
      return runOrder;
    }
  }

  if (leftRuns.length !== rightRuns.length) {
    return leftRuns.length - rightRuns.length;
  }

  return compareCodePoints(leftInput, rightInput);
}

function comparatorValue(
  comparator: OrderingComparator,
  input: OrderKeyInput,
):
  | { readonly value: string | number; readonly origin: ValueOrigin }
  | undefined {
  switch (comparator) {
    case "explicit-order":
      return input.explicitOrder === undefined
        ? undefined
        : {
            value: input.explicitOrder.value,
            origin: input.explicitOrder.origin,
          };
    case "manifest-order":
      return input.manifestOrder === undefined
        ? undefined
        : { value: input.manifestOrder, origin: "configuration" };
    case "chapter-section":
      return input.chapterSection === undefined
        ? undefined
        : {
            value: input.chapterSection,
            origin: input.chapterSectionOrigin ?? "derived",
          };
    case "natural-path":
    case "lexical-path":
      return { value: input.normalizedPath, origin: "derived" };
    case "source-discovery-order":
      return input.sourceDiscoveryOrder === undefined
        ? undefined
        : { value: input.sourceDiscoveryOrder, origin: "generated" };
  }
}

function validatePolicy(policy: OrderingPolicy): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  if (policy.comparators.length === 0) {
    diagnostics.push({
      code: "ORDER_COMPARATOR_CHAIN_EMPTY",
      severity: "error",
      message: "Ordering requires at least one configured comparator.",
      phase: "graph",
      remediation: "Configure an explicit comparator chain and tie policy.",
    });
  }

  const duplicates = policy.comparators.filter(
    (comparator, index) => policy.comparators.indexOf(comparator) !== index,
  );
  if (duplicates.length > 0) {
    diagnostics.push({
      code: "ORDER_COMPARATOR_DUPLICATE",
      severity: "error",
      message: `Ordering comparator chain repeats: ${[...new Set(duplicates)].join(", ")}.`,
      phase: "graph",
      remediation: "List each comparator at most once.",
    });
  }

  if (policy.locale !== undefined) {
    try {
      "ordering-probe".toLocaleLowerCase(policy.locale);
    } catch {
      diagnostics.push({
        code: "ORDER_LOCALE_INVALID",
        severity: "error",
        message: `Ordering locale '${policy.locale}' is invalid.`,
        phase: "graph",
        remediation: "Use a well-formed BCP 47 language tag or omit locale.",
      });
    }
  }

  return diagnostics;
}

export function buildOrderKey(
  input: OrderKeyInput,
  policy: OrderingPolicy,
): CompilerResult<OrderKey> {
  const diagnostics = [...validatePolicy(policy)];
  const components: {
    comparator: OrderingComparator;
    value: string | number;
    origin: ValueOrigin;
  }[] = [];

  for (const comparator of policy.comparators) {
    const component = comparatorValue(comparator, input);
    if (component === undefined) {
      if (policy.missingValuePolicy === "error") {
        diagnostics.push({
          code: "ORDER_VALUE_MISSING",
          severity: "error",
          message: `Node '${input.nodeId}' has no value for '${comparator}'.`,
          phase: "graph",
          nodeId: input.nodeId,
          remediation:
            "Provide the value or choose an explicit first/last missing-value policy.",
        });
      }
      continue;
    }

    components.push({
      comparator,
      value: component.value,
      origin: component.origin,
    });
  }

  if (
    diagnostics.some(
      (diagnostic) =>
        diagnostic.severity === "error" || diagnostic.severity === "fatal",
    )
  ) {
    return { ok: false, diagnostics };
  }

  const tieBreaker =
    policy.tiePolicy === "path"
      ? input.normalizedPath
      : policy.tiePolicy === "source-id"
        ? input.sourceId
        : "";
  return { ok: true, value: { components, tieBreaker }, diagnostics };
}

function componentByComparator(
  key: OrderKey,
  comparator: OrderingComparator,
): string | number | undefined {
  return key.components.find((component) => component.comparator === comparator)
    ?.value;
}

function compareValues(
  left: string | number,
  right: string | number,
  comparator: OrderingComparator,
  policy: OrderingPolicy,
): number {
  if (typeof left === "number" && typeof right === "number") {
    return left < right ? -1 : left > right ? 1 : 0;
  }

  const leftString = String(left);
  const rightString = String(right);
  if (comparator === "lexical-path") {
    const normalizedOrder = compareCodePoints(
      normalizeCase(leftString, policy),
      normalizeCase(rightString, policy),
    );
    return normalizedOrder !== 0
      ? normalizedOrder
      : compareCodePoints(leftString, rightString);
  }

  return compareNaturalStrings(leftString, rightString, policy);
}

export function compareOrderKeys(
  left: OrderKey,
  right: OrderKey,
  policy: OrderingPolicy,
  includeTieBreaker = true,
): number {
  for (const comparator of policy.comparators) {
    const leftValue = componentByComparator(left, comparator);
    const rightValue = componentByComparator(right, comparator);
    if (leftValue === undefined || rightValue === undefined) {
      if (leftValue === rightValue) {
        continue;
      }

      const missingOrder = policy.missingValuePolicy === "first" ? -1 : 1;
      return leftValue === undefined ? missingOrder : -missingOrder;
    }

    const order = compareValues(leftValue, rightValue, comparator, policy);
    if (order !== 0) {
      return order;
    }
  }

  return includeTieBreaker
    ? compareCodePoints(left.tieBreaker, right.tieBreaker)
    : 0;
}

export function sortOrderedNodes<TNode extends OrderedNode>(
  nodes: readonly TNode[],
  policy: OrderingPolicy,
): CompilerResult<readonly TNode[]> {
  const diagnostics = [...validatePolicy(policy)];
  const sorted = [...nodes].sort((left, right) => {
    const order = compareOrderKeys(left.orderKey, right.orderKey, policy);
    return order !== 0 ? order : compareCodePoints(left.nodeId, right.nodeId);
  });

  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    if (previous === undefined || current === undefined) {
      continue;
    }

    const primaryTie = compareOrderKeys(
      previous.orderKey,
      current.orderKey,
      policy,
      false,
    );
    if (primaryTie === 0 && policy.tiePolicy === "error") {
      diagnostics.push({
        code: "ORDER_KEY_TIE",
        severity: "error",
        message: `Nodes '${previous.nodeId}' and '${current.nodeId}' have equal order keys.`,
        phase: "graph",
        nodeId: current.nodeId,
        related: [
          { sourceId: previous.nodeId, message: "Equal ordering peer" },
        ],
        remediation:
          "Provide distinct explicit order values or configure a deterministic tie breaker.",
      });
    } else if (
      primaryTie === 0 &&
      previous.orderKey.tieBreaker === current.orderKey.tieBreaker
    ) {
      diagnostics.push({
        code: "ORDER_TIE_BREAKER_COLLISION",
        severity: "error",
        message: `Nodes '${previous.nodeId}' and '${current.nodeId}' share the same configured tie breaker.`,
        phase: "graph",
        nodeId: current.nodeId,
        remediation:
          "Use unique source paths or source identifiers for deterministic ordering.",
      });
    }
  }

  if (
    diagnostics.some(
      (diagnostic) =>
        diagnostic.severity === "error" || diagnostic.severity === "fatal",
    )
  ) {
    return { ok: false, diagnostics };
  }

  return { ok: true, value: sorted, diagnostics };
}

export function createContentNodeComparator(
  policy: OrderingPolicy,
): (left: ContentNode, right: ContentNode) => number {
  return (left, right) => {
    const order = compareOrderKeys(left.orderKey, right.orderKey, policy);
    return order !== 0 ? order : compareCodePoints(left.nodeId, right.nodeId);
  };
}
