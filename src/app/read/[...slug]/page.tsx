import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ReaderPage } from "@/components/reader/reader-page";
import {
  getAllCanonicalRoutes,
  getDocumentByRoute,
  getRuntimeBookData,
} from "@/runtime/artifacts";

interface BookRouteProperties {
  readonly params: Promise<{ readonly slug: readonly string[] }>;
}

function routeFromSlug(slug: readonly string[]): string {
  return `/read/${slug.map((segment) => encodeURIComponent(segment)).join("/")}`;
}

export const dynamicParams = false;

export async function generateStaticParams(): Promise<{ slug: string[] }[]> {
  const routes = await getAllCanonicalRoutes();
  return routes
    .filter((route) => route.startsWith("/read/"))
    .map((route) => ({
      slug: route.slice("/read/".length).split("/").map(decodeURIComponent),
    }));
}

export async function generateMetadata({
  params,
}: BookRouteProperties): Promise<Metadata> {
  const { slug } = await params;
  const loaded = await getDocumentByRoute(routeFromSlug(slug));
  if (loaded === undefined) {
    return { title: "Document not found" };
  }

  return {
    title: loaded.summary.title,
    alternates: { canonical: loaded.summary.canonicalRoute },
    description: `Read ${loaded.summary.title} in the source-preserving technical edition.`,
  };
}

export default async function BookRoute({ params }: BookRouteProperties) {
  const { slug } = await params;
  const route = routeFromSlug(slug);
  const [book, loaded] = await Promise.all([
    getRuntimeBookData(),
    getDocumentByRoute(route),
  ]);
  if (loaded === undefined) {
    notFound();
  }
  return <ReaderPage book={book} loaded={loaded} />;
}
