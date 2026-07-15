# Build and deployment

## Supported build products

The repository separates content compilation, application build, and hosting:

| Product | Command | Result | Header behavior |
| --- | --- | --- | --- |
| Development | `npm run dev` | Compiles content, then starts the Next.js development server | Development only; not a release artifact |
| Standalone server | `npm run build` | Compiles content and creates Next.js standalone output under `.next/` | `next.config.ts` supplies application security headers when requests are served by Next.js |
| Static export | `npm run build:static` | Compiles content and exports deployable static files under `out/` | No application code can attach response headers; the static host must configure them |

The content compiler is exercised in both production builds. Next.js reads the generated `build/` artifacts during route generation; a missing or inconsistent artifact fails the application build.

## Reproducible release procedure

Use a clean, immutable checkout and the committed lockfile:

```powershell
$env:SOURCE_DATE_EPOCH = "0"
$env:NEXT_TELEMETRY_DISABLED = "1"
npm ci
npm run typecheck
npm run lint
npm run test
npm run compile:verify
npm run audit:dependencies
npm run build:static
npx --no-install playwright install chromium
npm run test:e2e
```

Choose `npm run build` instead of `npm run build:static` for the standalone product. `npm ci` must be used for release; `npm install` may rewrite dependency resolution.

The package contract accepts Node.js 22 or newer. Release environments must pin an exact Node/npm image. The checked-in workflow pins one exact Node release; changing it is an environment change and requires a fresh determinism and browser test run.

## Generated directories and rollback behavior

`compile:content` manages `build/` and `public/_book/`. Each managed directory contains `.book-compiler-output`. The writer refuses to recursively replace an existing unmarked directory, preventing an output configuration mistake from deleting arbitrary data.

Publication occurs through sibling staging directories and rename. If replacing one directory fails, its prior managed version is restored when possible. This is not a distributed transaction across `build/` and `public/_book/`, and it is not a deployment rollback mechanism.

Release packaging must therefore:

1. build in an isolated workspace;
2. validate the completed application product;
3. publish the complete `out/` or standalone bundle as one immutable release;
4. switch traffic atomically at the hosting layer;
5. retain the prior immutable release for rollback.

Do not run the compiler against a shared production content directory while authors are writing. Discovery detects many concurrent modifications, but a stable source snapshot is the deployment boundary.

## Standalone server packaging

For a standalone deployment, package `.next/standalone` together with `.next/static` and `public` according to the Next.js standalone runtime layout. Run the generated server behind an HTTPS reverse proxy or managed load balancer.

The runtime reads artifacts from `process.cwd()/build`, so the packaged process working directory must contain the matching `build/` tree. Do not assume `server.js` is always directly under `.next/standalone`; verify the traced layout produced on the release platform. A portable `outputFileTracingRoot` policy has not been validated for this repository's Windows directory nesting.

The operator owns:

- TLS certificates, HTTPS redirects, HSTS, request size/time limits, process supervision, health checks, and graceful replacement;
- preservation of the configured security headers through every proxy/CDN hop;
- immutable release promotion and rollback;
- logging, Web Vitals, client-error collection, availability monitoring, and alerting;
- vulnerability remediation for the base image and operating system.

No application health endpoint is implemented. A deployment probe should request `/`, verify a successful HTML response, and verify `/_book/book-manifest.json` has a compatible artifact envelope without logging its content.

## Static hosting

Deploy the complete `out/` directory. Configure the host to serve the generated trailing-slash routes and `404.html` according to its routing model.

The reader and search provider use root-absolute `/read`, `/_book`, and asset URLs. Hosting under a URL subpath/base path is not supported by the current application without code/configuration changes.

`public/headers-static-example.txt` is a non-operative, Netlify/Cloudflare-Pages-style example. Its filename is deliberately not `_headers`; copying it into `public` does not activate headers. Translate and install the rules through the selected host's configuration, then confirm them against the deployed URL.

Static hosts must also consume `build/redirect-manifest.json` or an equivalent release-generated mapping. The file is not copied into `out/` as executable host configuration, and alias routes are not generated as pages.

Recommended cache classes:

- fingerprinted `/_next/static/` files: long-lived immutable caching;
- `/_book/` manifests/search chunks/assets: revalidate by default unless the entire deployment uses immutable versioned URLs;
- HTML and route redirects: short-lived or revalidated so an atomic release switch is visible;
- never expose `build/sources/`, internal document IR, diagnostics, or local build logs from a public origin.

## Security-header verification

After deployment, verify at least the root page, one nested route, a search manifest, and an original asset:

```powershell
curl.exe -sS -D - -o NUL https://example.invalid/
curl.exe -sS -D - -o NUL https://example.invalid/read/example/
curl.exe -sS -D - -o NUL https://example.invalid/_book/search-index/index.json
```

Confirm Content Security Policy, frame denial, MIME sniffing protection, referrer policy, permissions policy, correct content types, and intended caching. Enable HSTS only after HTTPS is guaranteed for the complete host and all relevant subdomains; it is intentionally a deployment decision rather than a repository default.

## Release acceptance

A release is acceptable only when all applicable items are recorded as passing:

- clean `npm ci` from the committed lockfile;
- typecheck, lint, unit/integration, deterministic compilation, dependency audit, and Playwright/axe gates;
- selected production application build;
- zero error/fatal build diagnostics and zero preservation violations;
- route and asset smoke tests against the packaged product;
- static response headers and redirects verified at the real host, or standalone headers verified through the real proxy path;
- accessibility audit and performance benchmark signed off for the release corpus;
- rollback artifact retained and restoration procedure tested.

Edge deployment, incremental regeneration, private-network packaging, and an offline application package are not validated release products in the current repository.
