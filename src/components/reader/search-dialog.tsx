"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { StaticSearchProvider, type SearchResult } from "@/runtime/search";

type LoadState = "idle" | "loading" | "ready" | "error";

export function SearchDialog() {
  const router = useRouter();
  const provider = useMemo(() => new StaticSearchProvider(), []);
  const inputReference = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [loadState, setLoadState] = useState<LoadState>("idle");

  const initialize = useCallback(async () => {
    if (loadState === "ready" || loadState === "loading") {
      return;
    }

    setLoadState("loading");
    try {
      await provider.initialize();
      setLoadState("ready");
    } catch {
      setLoadState("error");
    }
  }, [loadState, provider]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLocaleLowerCase("en-US") === "k"
      ) {
        event.preventDefault();
        setOpen(true);
        void initialize();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    document.documentElement.dataset["searchShortcutReady"] = "true";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      delete document.documentElement.dataset["searchShortcutReady"];
    };
  }, [initialize]);

  const results = useMemo<readonly SearchResult[]>(
    () => (loadState === "ready" ? provider.query(query, 24) : []),
    [loadState, provider, query],
  );

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      void initialize();
    }
  };

  const navigate = (result: SearchResult) => {
    const fragment = result.record.headingId
      ? `#${encodeURIComponent(result.record.headingId)}`
      : "";
    setOpen(false);
    router.push(`${result.record.route}${fragment}`);
  };

  return (
    <Dialog.Root onOpenChange={handleOpenChange} open={open}>
      <Dialog.Trigger asChild>
        <button
          aria-label="Search the book"
          className="search-trigger"
          type="button"
        >
          <Search aria-hidden="true" size={17} />
          <span>Search the book</span>
          <kbd className="search-shortcut">Ctrl K</kbd>
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          aria-describedby="search-description"
          className="dialog-content"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            inputReference.current?.focus();
          }}
        >
          <Dialog.Title className="sr-only">Search this book</Dialog.Title>
          <Dialog.Description className="sr-only" id="search-description">
            Search records retain their document, heading, field, and source
            location.
          </Dialog.Description>
          <div className="dialog-header">
            <label className="search-input-wrap">
              <Search aria-hidden="true" size={18} />
              <span className="sr-only">Search query</span>
              <input
                autoComplete="off"
                className="search-input"
                onChange={(event) => setQuery(event.currentTarget.value)}
                placeholder="Search concepts, headings, and code…"
                ref={inputReference}
                spellCheck="false"
                type="search"
                value={query}
              />
            </label>
            <Dialog.Close asChild>
              <button
                aria-label="Close search"
                className="icon-button"
                type="button"
              >
                <X aria-hidden="true" size={18} />
              </button>
            </Dialog.Close>
          </div>
          <div
            aria-live="polite"
            aria-relevant="additions text"
            className="search-results"
          >
            {loadState === "loading" ? (
              <p className="search-state">Loading the index…</p>
            ) : (
              <></>
            )}
            {loadState === "error" ? (
              <p className="search-state">
                The search index could not be loaded.
              </p>
            ) : (
              <></>
            )}
            {loadState === "ready" && query.trim().length === 0 ? (
              <p className="search-state">
                Enter two or more characters to search.
              </p>
            ) : (
              <></>
            )}
            {loadState === "ready" &&
            query.trim().length > 0 &&
            results.length === 0 ? (
              <p className="search-state">No matching source-backed records.</p>
            ) : (
              <></>
            )}
            {results.map((result) => (
              <button
                className="search-result"
                key={result.record.recordId}
                onClick={() => navigate(result)}
                type="button"
              >
                <span className="search-result-title">
                  {result.record.field === "heading"
                    ? "Section"
                    : result.record.field}
                </span>
                <span className="search-result-text">{result.record.text}</span>
              </button>
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
