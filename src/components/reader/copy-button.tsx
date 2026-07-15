"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";

interface CopyButtonProperties {
  readonly value: string;
}

export function CopyButton({ value }: CopyButtonProperties) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) {
      return undefined;
    }

    const timeout = window.setTimeout(() => setCopied(false), 1_500);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <button
      aria-label={copied ? "Code copied" : "Copy code"}
      className="icon-button code-copy"
      onClick={() => void copy()}
      type="button"
    >
      {copied ? (
        <Check aria-hidden="true" size={16} />
      ) : (
        <Copy aria-hidden="true" size={16} />
      )}
      <span className="sr-only" aria-live="polite">
        {copied ? "Copied" : "Copy code"}
      </span>
    </button>
  );
}
