import Link from "next/link";

import { BookHeader } from "@/components/reader/book-header";
import { BookNavigation } from "@/components/reader/book-navigation";
import { DocumentOutline } from "@/components/reader/document-outline";
import { DocumentRenderer } from "@/components/reader/document-renderer";
import { RouteFocus } from "@/components/reader/route-focus";
import type { LoadedBookDocument, RuntimeBookData } from "@/runtime/types";

interface ReaderPageProperties {
  readonly book: RuntimeBookData;
  readonly loaded: LoadedBookDocument;
}

export function ReaderPage({ book, loaded }: ReaderPageProperties) {
  const { document, next, previous, summary } = loaded;

  return (
    <div className="reader-frame">
      <BookHeader
        activeDocumentId={document.documentId}
        corpusId={book.documents.corpusId}
        corpusVersion={book.documents.corpusVersion}
        navigation={book.navigation}
      />
      <div className="reader-grid">
        <aside className="book-sidebar">
          <BookNavigation
            activeDocumentId={document.documentId}
            manifest={book.navigation}
          />
        </aside>
        <main className="reader-main" id="main-content" tabIndex={-1}>
          <RouteFocus title={summary.title} />
          <article
            className="reader-document"
            data-document-id={document.documentId}
          >
            <div className="document-eyebrow">Source-preserving edition</div>
            <p className="document-path">{summary.relativePath}</p>
            <DocumentRenderer document={document} />
            <nav
              aria-label="Document pagination"
              className="document-pagination"
            >
              {previous === undefined ? (
                <span />
              ) : (
                <Link
                  className="pagination-link"
                  data-direction="previous"
                  href={previous.canonicalRoute}
                >
                  <span className="pagination-label">Previous</span>
                  <span className="pagination-title">{previous.title}</span>
                </Link>
              )}
              {next === undefined ? (
                <span />
              ) : (
                <Link
                  className="pagination-link"
                  data-direction="next"
                  href={next.canonicalRoute}
                >
                  <span className="pagination-label">Next</span>
                  <span className="pagination-title">{next.title}</span>
                </Link>
              )}
            </nav>
          </article>
        </main>
        <aside className="outline-sidebar">
          <DocumentOutline headings={document.headings} />
        </aside>
      </div>
    </div>
  );
}
