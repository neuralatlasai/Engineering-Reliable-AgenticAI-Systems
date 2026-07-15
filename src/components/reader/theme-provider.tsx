"use client";

import type { ComponentProps } from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

export function ThemeProvider(
  properties: ComponentProps<typeof NextThemesProvider>,
) {
  return <NextThemesProvider {...properties} />;
}
