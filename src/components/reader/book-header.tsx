import Link from "next/link";

import type { NavigationManifest } from "@/compiler/model";
import { BookNavigation } from "@/components/reader/book-navigation";
import { MobileNavigation } from "@/components/reader/mobile-navigation";
import { ReaderActions } from "@/components/reader/reader-state";
import { SearchDialog } from "@/components/reader/search-dialog";
import { ThemeToggle } from "@/components/reader/theme-toggle";

interface BookHeaderProperties {
  readonly activeDocumentId: string;
  readonly corpusId: string;
  readonly corpusVersion: string;
  readonly navigation: NavigationManifest;
}

export function BookHeader({
  activeDocumentId,
  corpusId,
  corpusVersion,
  navigation,
}: BookHeaderProperties) {
  return (
    <header className="reader-header">
      <MobileNavigation>
        <BookNavigation
          activeDocumentId={activeDocumentId}
          manifest={navigation}
        />
      </MobileNavigation>
      <Link className="brand-lockup" href="/">
        <span aria-hidden="true" className="brand-mark">
          AI
        </span>
        <span className="brand-copy">
          <span className="brand-kicker">Technical field guide</span>
          <span className="brand-title">
            Engineering Reliable Agentic AI Systems
          </span>
        </span>
      </Link>
      <div className="header-actions">
        <SearchDialog />
        <ReaderActions
          corpusId={corpusId}
          corpusVersion={corpusVersion}
          documentId={activeDocumentId}
        />
        <ThemeToggle />
      </div>
    </header>
  );
}
