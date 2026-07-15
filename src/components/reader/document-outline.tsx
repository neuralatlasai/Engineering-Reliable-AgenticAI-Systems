"use client";

import type { CSSProperties } from "react";
import { useEffect, useState } from "react";

import type { HeadingRecord } from "@/compiler/model";

interface DocumentOutlineProperties {
  readonly headings: readonly HeadingRecord[];
}

export function DocumentOutline({ headings }: DocumentOutlineProperties) {
  const [activeId, setActiveId] = useState<string | undefined>(
    headings[0]?.effectiveId,
  );

  useEffect(() => {
    const elements = headings
      .map((heading) => document.getElementById(heading.effectiveId))
      .filter((element): element is HTMLElement => element !== null);
    if (elements.length === 0) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort(
            (left, right) =>
              left.boundingClientRect.top - right.boundingClientRect.top,
          );
        const first = visible[0]?.target;
        if (first instanceof HTMLElement) {
          setActiveId(first.id);
        }
      },
      { rootMargin: "-15% 0px -70% 0px", threshold: [0, 1] },
    );

    for (const element of elements) {
      observer.observe(element);
    }
    return () => observer.disconnect();
  }, [headings]);

  if (headings.length === 0) {
    return (
      <nav aria-label="On this page">
        <h2 className="outline-title">On this page</h2>
        <p className="outline-link">No authored headings</p>
      </nav>
    );
  }

  const minimumDepth = Math.min(...headings.map((heading) => heading.depth));

  return (
    <nav aria-label="On this page">
      <h2 className="outline-title">On this page</h2>
      <ol className="outline-list">
        {headings.map((heading) => (
          <li key={heading.headingId}>
            <a
              className="outline-link"
              data-active={activeId === heading.effectiveId ? "true" : "false"}
              href={`#${heading.effectiveId}`}
              style={
                {
                  "--outline-depth": Math.max(0, heading.depth - minimumDepth),
                } as CSSProperties
              }
            >
              {heading.plainText}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
