# Security model

## Security status

The current product is a build-time compiler and read-only book UI. It has no application API, account system, database, uploaded-content endpoint, OAuth/JWT lifecycle, or background job service. Controls for those systems are therefore out of scope rather than implicitly satisfied.

The checked-in corpus is marked `reviewed`. The compiler records `trusted-static`, `reviewed`, or `untrusted` provenance on every source, but the production path currently applies one global rendering/link policy. Trust-level-specific enforcement is **not implemented**; do not treat the label itself as a security boundary.

## Trust boundaries

```text
untrusted/reviewed source bytes
        |
        | bounded read, encoding validation, parser quarantine
        v
trusted build process and dependencies
        |
        | validated/canonical artifacts
        v
trusted deployment package
        |
        | host TLS, headers, MIME, caching, redirects
        v
untrusted browser inputs (URL, localStorage, keyboard/search query)
```

The build worker has filesystem read access to configured content roots and write access to managed output directories. A malicious dependency or trusted build-script change is inside that worker's trust boundary. Run builds with least privilege, no unrelated secrets, and an isolated workspace.

## Implemented controls

### Source and configuration

- Strict runtime configuration objects reject unknown keys and prototype-sensitive record keys.
- Source reads are bounded by `validationPolicy.maxSourceBytes`, verify file identity before/after reading, and reject invalid or non-round-trippable text encodings.
- Symbolic-link behavior is explicit; the repository ignores symlinks. Follow modes detect cycles and duplicate physical sources.
- Canonical path handling and duplicate logical/physical/source-ID checks prevent ambiguous source selection.
- Internal URL resolution rejects invalid traversal and validates protocols against an allowlist.

### Parsing and rendering

- Raw HTML is retained separately, then sanitized with an allowlist before the renderer uses `dangerouslySetInnerHTML`.
- Protocol-relative URLs are disabled by the sanitizer; schemes come from the configured link allowlist.
- MDX expressions, JSX, and ESM are represented as quarantined source and are never evaluated.
- Unsupported syntax is preserved and rendered as escaped source, not silently discarded.
- KaTeX HTML is generated at build time from retained equation source; on failure the renderer displays escaped source.
- External links open with `noopener noreferrer`.
- Directives carry a security classification, but no arbitrary directive code is executed by the current renderer.
- Diagram policy is source-only for this corpus; no Mermaid/JavaScript execution occurs in the browser.

### Artifacts and filesystem

- Artifact output uses managed-directory markers and refuses to recursively replace an unmarked directory.
- Runtime artifact paths are resolved under the fixed `build/` root and reject traversal outside it.
- JSON outputs use versioned envelopes; selected artifact types are schema-validated before publication.
- Original source copies remain in internal `build/`, while only selected search/manifests/assets are written to `public/_book/`.
- Dependencies have exact versions and a committed lockfile. CI uses `npm ci` and fails `npm audit` findings at high severity or above.

### Browser and response policy

Standalone Next.js responses configure CSP, frame denial, same-origin opener/resource policy, restricted permissions, referrer policy, and MIME sniffing protection. The CSP prohibits objects, frames, cross-origin defaults, and non-self network connections.

The static export cannot set headers. `public/headers-static-example.txt` is an inert example; deployment must install equivalent rules and verify the real response path.

Reader state is bounded, schema-checked, corpus-scoped local storage. It is a preference cache, not an authorization source. Invalid state is discarded. No sensitive data should be stored there.

## Threat and responsibility matrix

| Threat | Repository control | Remaining responsibility |
| --- | --- | --- |
| Script execution from Markdown/MDX | HTML sanitizer, MDX quarantine, no evaluation | Review sanitizer/dependency updates and test adversarial fixtures. |
| Unsafe link protocols/path traversal | Protocol allowlist and source-relative traversal validation | Keep allowlist minimal; validate redirect rules at host. |
| DOM clobbering/raw markup abuse | Sanitizer allowlist and React escaping | Current sanitizer permits authored `id`, `name`, `aria-*`, and `data-*`; adversarial DOM-clobbering coverage is pending. |
| Malicious original asset | Type registry and `nosniff`; objects/frames prohibited by CSP | Originals are intentionally copied without malware scanning or SVG/PDF sanitization. Scan/quarantine untrusted assets and serve downloads with correct MIME/disposition, potentially from a separate origin. |
| Asset changed after discovery | Discovery detects changes during its bounded read | Publication later copies from the filesystem path rather than the retained bytes and does not rehash; build from an immutable snapshot until this TOCTOU gap is removed. |
| Build path deletion | Managed marker and path normalization | Run with a dedicated output directory and least filesystem privilege. |
| Supply-chain compromise | Exact versions, lockfile, audit gate, immutable CI action SHAs | Review lockfile changes, enable provenance/signing/SBOM and base-image scanning in release infrastructure. |
| Artifact tampering | Hash index and immutable-build recommendation | Sign release artifacts and verify after transport; current runtime only performs a minimal envelope check. |
| Clickjacking/cross-origin embedding | CSP `frame-ancestors 'none'`, `X-Frame-Options: DENY` | Ensure proxies/static hosts preserve headers. |
| Transport downgrade | None in application repository | Enforce HTTPS redirects and HSTS at the host after domain validation. |
| Denial of service from large corpus/source | Per-source byte bound and bounded read concurrency | Enforce repository/storage quotas and CI time/memory limits; total corpus size is not bounded by configuration. |

## Known limitations requiring explicit acceptance

- The CSP currently includes `'unsafe-inline'` for scripts and styles to support the generated Next.js product. Nonce/hash-based CSP hardening is pending.
- Content trust labels do not select sanitizer, directive, MDX, diagram, or asset behavior. Use the strict global policy for any untrusted corpus.
- Full artifact schemas are not applied at every runtime read boundary.
- Public original SVG, PDF, media, and data assets are copied byte-for-byte with no malware/content-disarm step.
- There is no SBOM, artifact signature, SLSA provenance, secret scanner, container scanner, or CSP reporting endpoint in this repository.
- There is no host-level rate limiting/WAF because there is no dynamic application endpoint. Add those controls if dynamic APIs are introduced.
- `build/` contains absolute-path-free manifests but compiler diagnostics and local cache may expose source identity/path context; keep build logs private.

## Release security verification

Before promotion:

1. Review every lockfile and CI workflow change; run `npm run audit:dependencies` from the locked install.
2. Compile adversarial HTML, MDX, URL, metadata-key, encoding, path-traversal, duplicate-ID, and oversized-source fixtures.
3. Confirm error/fatal diagnostic count is zero and review every warning/quarantined node.
4. Verify only intended files are present in the deployment package; specifically confirm `build/sources` and internal diagnostics are absent.
5. Test response headers through the production CDN/proxy and validate asset MIME types.
6. Run a browser security scan under the actual CSP and confirm no blocked application resources or unexpected connections.
7. Record exceptions for copied active-content assets and isolate or remove any that are not required.

No penetration-test or production header-scan result is recorded in this repository; final security verification remains pending.
