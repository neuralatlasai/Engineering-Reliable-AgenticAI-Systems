"use client";

import { Bookmark, BookmarkCheck, CheckCircle2, Circle } from "lucide-react";
import { useCallback, useMemo, useSyncExternalStore } from "react";

interface ScrollState {
  readonly offset: number;
  readonly progress: number;
  readonly updatedAt: number;
}

interface ReaderState {
  readonly completedDocumentIds: readonly string[];
  readonly bookmarkedDocumentIds: readonly string[];
  readonly expandedNodeIds: readonly string[];
  readonly perDocumentScrollState: Readonly<Record<string, ScrollState>>;
  readonly lastVisitedDocumentId?: string;
}

interface ReaderStateEnvelope {
  readonly schemaVersion: "1";
  readonly corpusId: string;
  readonly corpusVersion: string;
  readonly state: ReaderState;
}

interface ReaderActionsProperties {
  readonly corpusId: string;
  readonly corpusVersion: string;
  readonly documentId: string;
}

const MAX_TRACKED_DOCUMENTS = 5_000;
const READER_STATE_EVENT = "book-reader-state-change";

function emptyState(): ReaderState {
  return {
    completedDocumentIds: [],
    bookmarkedDocumentIds: [],
    expandedNodeIds: [],
    perDocumentScrollState: {},
  };
}

function isStringArray(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) &&
    value.length <= MAX_TRACKED_DOCUMENTS &&
    value.every((item) => typeof item === "string")
  );
}

function parseEnvelope(
  value: string,
  corpusId: string,
  corpusVersion: string,
): ReaderStateEnvelope {
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("schemaVersion" in parsed) ||
      !("corpusId" in parsed) ||
      !("state" in parsed)
    ) {
      throw new Error("Reader-state envelope is missing required fields.");
    }

    const candidate = parsed as Record<string, unknown>;
    const rawState = candidate["state"];
    if (
      candidate["corpusId"] !== corpusId ||
      typeof rawState !== "object" ||
      rawState === null
    ) {
      throw new Error("Reader state belongs to another corpus.");
    }

    const record = rawState as Record<string, unknown>;
    const completed = record["completedDocumentIds"];
    const bookmarks = record["bookmarkedDocumentIds"];
    const expanded = record["expandedNodeIds"];
    if (
      !isStringArray(completed) ||
      !isStringArray(bookmarks) ||
      !isStringArray(expanded)
    ) {
      throw new Error(
        "Reader state contains an invalid identifier collection.",
      );
    }

    return {
      schemaVersion: "1",
      corpusId,
      corpusVersion,
      state: {
        completedDocumentIds: completed,
        bookmarkedDocumentIds: bookmarks,
        expandedNodeIds: expanded,
        perDocumentScrollState: {},
        ...(typeof record["lastVisitedDocumentId"] === "string"
          ? { lastVisitedDocumentId: record["lastVisitedDocumentId"] }
          : {}),
      },
    };
  } catch {
    return { schemaVersion: "1", corpusId, corpusVersion, state: emptyState() };
  }
}

function toggleBounded(
  values: readonly string[],
  value: string,
): readonly string[] {
  if (values.includes(value)) {
    return values.filter((candidate) => candidate !== value);
  }
  return [...values.slice(-(MAX_TRACKED_DOCUMENTS - 1)), value];
}

export function ReaderActions({
  corpusId,
  corpusVersion,
  documentId,
}: ReaderActionsProperties) {
  const storageKey = useMemo(() => `reader-state:${corpusId}`, [corpusId]);
  const subscribe = useCallback((onStoreChange: () => void) => {
    const listener = () => onStoreChange();
    window.addEventListener("storage", listener);
    window.addEventListener(READER_STATE_EVENT, listener);
    return () => {
      window.removeEventListener("storage", listener);
      window.removeEventListener(READER_STATE_EVENT, listener);
    };
  }, []);
  const getSnapshot = useCallback(
    () => window.localStorage.getItem(storageKey) ?? "",
    [storageKey],
  );
  const storedState = useSyncExternalStore(subscribe, getSnapshot, () => "");
  const state = useMemo(
    () =>
      storedState.length === 0
        ? emptyState()
        : parseEnvelope(storedState, corpusId, corpusVersion).state,
    [corpusId, corpusVersion, storedState],
  );

  const persist = useCallback(
    (nextState: ReaderState) => {
      const envelope: ReaderStateEnvelope = {
        schemaVersion: "1",
        corpusId,
        corpusVersion,
        state: nextState,
      };
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(envelope));
        window.dispatchEvent(new Event(READER_STATE_EVENT));
      } catch {
        // Persistence failure is intentionally non-destructive; the in-memory state remains valid.
      }
    },
    [corpusId, corpusVersion, storageKey],
  );

  const completed = state.completedDocumentIds.includes(documentId);
  const bookmarked = state.bookmarkedDocumentIds.includes(documentId);

  return (
    <div aria-label="Reader actions" className="reader-actions">
      <button
        aria-pressed={bookmarked}
        className="reader-action"
        onClick={() =>
          persist({
            ...state,
            bookmarkedDocumentIds: toggleBounded(
              state.bookmarkedDocumentIds,
              documentId,
            ),
            lastVisitedDocumentId: documentId,
          })
        }
        type="button"
      >
        {bookmarked ? (
          <BookmarkCheck aria-hidden="true" size={18} />
        ) : (
          <Bookmark aria-hidden="true" size={18} />
        )}
        <span className="sr-only">
          {bookmarked ? "Remove bookmark" : "Bookmark this document"}
        </span>
      </button>
      <button
        aria-pressed={completed}
        className="reader-action"
        onClick={() =>
          persist({
            ...state,
            completedDocumentIds: toggleBounded(
              state.completedDocumentIds,
              documentId,
            ),
            lastVisitedDocumentId: documentId,
          })
        }
        type="button"
      >
        {completed ? (
          <CheckCircle2 aria-hidden="true" size={18} />
        ) : (
          <Circle aria-hidden="true" size={18} />
        )}
        <span className="sr-only">
          {completed
            ? "Mark this document incomplete"
            : "Mark this document complete"}
        </span>
      </button>
    </div>
  );
}
