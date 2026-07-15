import Link from "next/link";

export default function NotFoundPage() {
  return (
    <main className="reader-main" id="main-content">
      <article className="reader-document prose">
        <p className="document-eyebrow">Route validation</p>
        <h1>Document not found</h1>
        <p>
          The requested route is not present in the compiled route manifest.
        </p>
        <p>
          <Link href="/">Return to the book index</Link>
        </p>
      </article>
    </main>
  );
}
