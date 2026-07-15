# Accessibility audit

## Result summary

| Item | Status |
| --- | --- |
| Target | WCAG 2.2 Level AA |
| Automated Chromium/axe suite | Implemented in `tests/e2e/reader.spec.ts` |
| Latest packaged-product automated result | Passed on standalone and static products |
| Manual keyboard/screen-reader/zoom/contrast audit | Pending |
| Static-export accessibility smoke test | Pending |
| Conformance claim | Not issued |

An axe run with zero reported violations is necessary but is not evidence of WCAG conformance by itself. This report does not claim that the current revision passes WCAG 2.2 AA until both automated and manual sections are completed against the packaged release.

## Implemented automated coverage

Local `npm run test:e2e` starts the development product for rapid feedback. CI first builds `out/`, serves the packaged static product through the path-confined test server, and runs Playwright against desktop Chromium and a Pixel 7 emulation profile. The same matrix was also run against the standalone production server for this release candidate. The suite verifies:

- a visible `main`, first article heading, labelled book navigation, document title, and no page-level horizontal overflow on `/`;
- `Ctrl+K` opens search and focuses the named search box;
- a source-backed search result becomes visible;
- axe finds no automatically detectable violations tagged `wcag2a`, `wcag2aa`, `wcag21aa`, or `wcag22aa` on the root page;
- the mobile navigation opens as a labelled dialog and closes with Escape.

The quality workflow installs the pinned Playwright Chromium browser and runs this suite. The final workflow result is not embedded in this document and must be linked in release evidence.

## Implemented interface foundations

- A visible-on-focus skip link targets a focusable `main` landmark.
- Header, main, article, complementary sidebars, and labelled navigation landmarks use semantic elements.
- Route changes focus the main region when no fragment is present and announce the loaded document through an atomic live region.
- Current navigation uses `aria-current="page"`; document pagination is separately labelled.
- Search and mobile navigation use Radix dialog primitives, labelled controls, explicit close buttons, and focus entry management.
- Icon-only actions expose accessible names and pressed state where applicable.
- Code blocks and wide tables use keyboard-focusable scroll regions; copy controls do not replace source code.
- External links include a screen-reader-only new-window notice.
- Images use authored alternate text when present; task-list controls have state labels.
- The document renderer uses `dir="auto"`, CSS preserves plaintext bidi behavior, and the page supports overflow-safe technical content.
- CSS defines visible focus indicators, reduced-motion behavior, forced-colors adjustments, responsive breakpoints, light/dark color schemes, and print rules.
- Raw/unknown/executable content fallbacks remain readable text rather than disappearing.

## Coverage gaps and exceptions

These items are not covered by the current automated result and must not be inferred as passing:

- only the root route is scanned with axe; representative code, table, math, footnote, HTML, directive, unsupported-node, deep-heading, and no-heading routes are not enumerated;
- the browser matrix is Chromium only; Firefox, WebKit, platform accessibility APIs, and real mobile assistive technology are untested;
- Playwright uses the development server, while the static export and standalone production package are not accessibility-smoke-tested;
- authored heading level order is rendered faithfully but is not validated for skipped/illogical hierarchy;
- tables infer the first row as column headers and have a scroll-region label, but authored captions, complex header associations, row headers, and irregular tables are not modeled;
- missing image alternative text falls back to an empty `alt` without a build diagnostic;
- math has a source-based accessible label and block `role="math"`, but speech quality and screen-reader interoperability are not manually validated;
- Mermaid is displayed as source, and no diagram-description model is implemented;
- per-document language metadata and a full right-to-left page mode are not wired to the root `html` element;
- bookmark/completion persistence failure is silent to assistive technology;
- browser zoom/reflow at 200% and 400%, text spacing overrides, high-contrast themes, color contrast, target size, pointer gestures, and cognitive usability require manual review;
- there are no approved visual-regression baselines.

## Manual audit protocol

Execute against both the standalone and static release candidates where applicable.

### Keyboard and focus

1. Traverse every global action, navigation branch, outline link, content link, code/table scroller, search result, and pagination control using only keyboard input.
2. Confirm focus order follows logical DOM order at desktop and mobile breakpoints.
3. Open/close both dialogs with keyboard, test Tab/Shift+Tab containment, Escape, restored trigger focus, and absence of background interaction.
4. Enter direct routes and fragments, use browser back/forward, and confirm appropriate focus without unexpected scroll jumps.
5. Confirm skip navigation is the first useful focus target and visible when focused.

### Screen reader

Test at minimum NVDA with Firefox/Chrome and VoiceOver with Safari. Verify landmarks, navigation names, heading outline, current-page state, search announcements/results, route announcements, task state, external-link notice, tables, equations, footnotes, and content fallbacks. Record browser, assistive-technology version, route, expected result, actual result, and issue ID.

### Visual adaptation

Test 200% and 400% zoom, 320 CSS-pixel reflow, user text-spacing overrides, light/dark mode, Windows forced colors, reduced motion, long unbroken code/URLs, multilingual content, bidi/RTL samples, and print preview. No content or control may be clipped or require two-dimensional page scrolling, except intentionally scrollable technical artifacts.

### Content semantics

Sample documents with every renderer node type. Verify one meaningful page title and H1, logical authored heading order, descriptive link text, non-empty meaningful image alternatives, table captions/headers, diagram descriptions, equation speech/fallback, and unique heading IDs.

## Release acceptance

Release approval requires:

- `npm run test:e2e` passing with no axe A/AA violations in every configured Playwright project;
- axe coverage expanded to a representative renderer fixture/route matrix;
- all critical/serious manual findings fixed and moderate findings dispositioned;
- keyboard and screen-reader protocols completed with evidence;
- static and standalone packaged-product smoke tests completed;
- no unexplained horizontal page overflow at supported breakpoints;
- a dated issue register and reviewer sign-off attached to this report.

### Verification record

| Field | Value |
| --- | --- |
| Revision | Pre-push release candidate, 2026-07-15 |
| Build/corpus hash | `2a46b1dad12af6f0972f8c5c4374b207be33638b86b3e366cda8e0840f5e76dd` |
| CI workflow URL | Pending |
| Automated result | 7 passed, 1 inapplicable desktop skip; standalone and static products |
| Manual reviewers | Pending |
| Tested browser/AT versions | Pending |
| Open exception IDs | Pending |
| Approval date | Pending |
