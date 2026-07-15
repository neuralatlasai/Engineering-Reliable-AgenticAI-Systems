"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

interface RouteFocusProperties {
  readonly title: string;
}

export function RouteFocus({ title }: RouteFocusProperties) {
  const pathname = usePathname();

  useEffect(() => {
    if (window.location.hash.length > 0) {
      return;
    }
    const main = document.getElementById("main-content");
    main?.focus({ preventScroll: true });
  }, [pathname]);

  return (
    <span aria-atomic="true" aria-live="polite" className="sr-only">
      Loaded document: {title}
    </span>
  );
}
