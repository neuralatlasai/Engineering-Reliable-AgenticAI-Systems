import { notFound } from "next/navigation";

import { ReaderPage } from "@/components/reader/reader-page";
import { getDocumentByRoute, getRuntimeBookData } from "@/runtime/artifacts";

export default async function HomePage() {
  const [book, loaded] = await Promise.all([
    getRuntimeBookData(),
    getDocumentByRoute("/"),
  ]);
  if (loaded === undefined) {
    notFound();
  }
  return <ReaderPage book={book} loaded={loaded} />;
}
