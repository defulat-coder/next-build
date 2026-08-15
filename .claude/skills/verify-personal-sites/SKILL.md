---
name: verify-personal-sites
description: Use after ANY website code or public-content change in personal-sites, before reporting work as done, even when the user did not ask for verification. Prove build health, public-content privacy, browser behavior, desktop layout, and reference-derived visual structure with saved evidence.
---

# Verify personal-sites

Verify evidence, not the maker's confidence. This project starts as a private data/OKF pipeline
and will gain a public website later. Never let a successful UI build hide a private-content leak,
and never call a screenshot “close enough” without reproducible browser and layout evidence.

## Safety and scope

- Identity, project, writing, and career categories are approved for public use, but website content may consume only the generated public projection under `knowledge/public/` after it passes Zod validation, redaction, provenance, secret, privacy, and third-party-confidentiality checks.
- The website runtime, browser, build output, and verification evidence must never load, render, copy, screenshot, or bundle `data/sensitive/`, `knowledge/sensitive/`, `.env*`, access tokens, or raw session history. A dedicated offline public-projection step may read source records, but it may write only redacted, provenance-bearing output to `knowledge/public/` and must account for every selected record.
- Reference `https://www.aihero.dev/` as the desktop design-system source. The user confirmed reproduction authorization, so the exact source mark and non-identity thumbnails are allowed. Do not copy its prose, portrait identity, testimonials, course/product claims, subscriber counts, newsletter collection, or account behavior.
- Active viewport scope is desktop `1440×900` only. Mobile implementation and verification are explicitly deferred until the user reopens that scope.
- Run against loopback (`127.0.0.1`) unless the user explicitly approves another environment. Do not deploy, publish, push, merge, or submit forms as part of verification.

## Required stable project commands

The website foundation must pin pnpm in `package.json`, commit `pnpm-lock.yaml`, use TypeScript +
React + Next.js + shadcn/ui + Zod + Vitest, and provide these stable commands:

```bash
pnpm dev
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm verify:content
pnpm verify:quick
pnpm verify:visual
```

If any command is missing, stop with `BLOCKED missing_site_harness`. Do not replace a missing
checker with manual eyeballing. The `foundation` target owns implementing these wrappers.

The active Product Design workflow selects the in-app Browser as its browser surface. Do not run
the standalone Playwright-backed `verify:quick` or `verify:visual` commands without explicit user
permission. Their contracts may instead be executed through the in-app Browser with saved
screenshots, metrics, console/link/resource results, and an independent checker report.

## Quick pass — after every website code/content change

1. Confirm `node --version` satisfies the repository's `>=20` engine.
2. Run `pnpm data:verify:okf`; capture exit code and the final summary line.
3. Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`; require exit `0` with no lint, type, test, or build failures. The `test` script must run Vitest once, never enter watch mode.
4. Run `pnpm verify:content`; require exit `0` and evidence showing:
   - zero imports/reads/references to private source directories or secret-bearing files;
   - every rendered claim resolves to the public projection and its source ID/hash;
   - zero secret-pattern, credential, private-personal-data, or third-party-confidentiality findings in the public projection, client/server bundles, and generated evidence;
   - `knowledge/public/content-manifest.json` passes its Zod schema and reports source count, published count, excluded count by reason, deterministic hashes, and zero silent drops;
   - no fabricated project, employer, metric, testimonial, writing, or credential content.

   Bootstrap exception for target `foundation`: while `public-content` is still `pending`, the
   content-manifest requirements above are deferred. `verify:content` must instead prove that the
   foundation renders no personal/project/career/writing claims and that its source and compiled
   output contain zero private-source references and zero secret findings. It must record
   `publicProjection.result=deferred`; this exception expires as soon as `public-content` starts.

   For target `public-content`, the manifest and projection requirements are mandatory, but the
   application must continue rendering zero personal claims until `shell`/content sections own the
   UI integration. Require every projected title, summary, and URL to carry source ID, source hash,
   and evidence hash even when it is not rendered yet.
5. Execute the `verify:quick` contract in the approved in-app Browser; if standalone Playwright is
   explicitly authorized, `pnpm verify:quick` may be used and must exit `0`. The contract must
   load `/`, exercise header navigation and the changed section, check one adjacent section,
   collect browser console/network failures, check internal links, and stop its own server.
   During `foundation` only, exercise the skip link and foundation landmark; header navigation and
   an adjacent section do not exist yet and become mandatory at `shell`.
   During the non-visual `public-content` target, rerun the same foundation interaction as an exact
   regression and require the generated projection checks to pass; do not render the new claims early.
6. Save the command results beneath `var/verification/personal-site/latest/`; never store private content in evidence.

## Deep visual pass — before a target is marked verified

Execute the deep visual contract in the approved in-app Browser; if standalone Playwright is
explicitly authorized, `pnpm verify:visual` may be used. The contract must:

1. Capture or reuse an approved, timestamped, content-hashed homepage baseline from `https://www.aihero.dev/`.
2. Capture reference and local screenshots at desktop `1440×900`.
3. Exercise the local homepage as a visitor: header anchors, hero, selected work, latest knowledge,
   about/career, footer, and any changed interactive control. Skip a content-dependent section only
   when the verification manifest marks it blocked; a blocked target can never pass.
4. Record landmark bounding boxes normalized to viewport dimensions. Compare the approved mapping,
   not raw text or identity-image pixels. Require maximum normalized delta ≤ `0.05` desktop.
5. Check zero browser console errors, zero failed first-party requests, zero broken internal links,
   zero critical accessibility violations, and no unexpected horizontal overflow or layout shift.
6. Capture the changed state plus one adjacent regression state. For rendering/assets changes,
   include a layout-shift trace or equivalent metric.
7. Write screenshots, layout metrics, console/network summaries, accessibility output, content-boundary
   results, and checker notes under `var/verification/personal-site/latest/`.

For target `foundation` only, capture the desktop reference viewport but do not assert landmark parity or
exercise sections that have not been implemented against an intentionally content-free scaffold.
Record `layout.mode=foundation-harness`, normalized deltas of `0` for the harness self-check, and
`comparisonTarget=none`; parity and full-navigation checks become mandatory at `shell` and this
exception cannot be reused by later targets.

For target `public-content`, use `layout.mode=public-content-regression`: reuse the approved
reference baseline and require the desktop local screenshot hash, landmarks, browser health,
and layout shift to match the verified foundation exactly. This is a non-visual regression mode,
not a second foundation exception; reference landmark parity becomes mandatory at `shell`.

## Required manifest

`var/verification/personal-site/latest/manifest.json` must be valid JSON with at least:

```json
{
  "result": "pass",
  "runId": "timestamp-or-content-hash",
  "referenceUrl": "https://www.aihero.dev/",
  "localUrl": "http://127.0.0.1:3000/",
  "viewports": ["desktop-1440x900"],
  "consoleErrors": 0,
  "failedRequests": 0,
  "brokenInternalLinks": 0,
  "criticalAccessibilityViolations": 0,
  "privateSourceReferences": 0,
  "secretFindings": 0,
  "layout": {
    "desktopMaxNormalizedDelta": 0.05
  },
  "targets": {},
  "checker": {
    "result": "PASS",
    "report": "checker-report.md"
  }
}
```

`localUrl` may differ only if the approved foundation records a stable alternative. A maker run
writes `pending-checker`; only the independent checker may write a pass manifest after rerunning the
contract. A pass manifest must be written atomically after every underlying check passes; never
reuse an earlier green manifest.

## Pass/fail criteria

Pass only when every command and the selected target's relevant checks above are green, required
evidence exists, and an independent checker confirms the manifest against the artifacts. A target marked blocked,
missing evidence, a stale baseline, a privacy/factual concern, or checker disagreement is `partial`
or `failed`, never pass.

## On failure

- Save the exact command, exit code, concise error/log excerpt, affected target, and evidence path.
- The maker may fix the same bounded target and re-run twice.
- After two failed fixes, or immediately for privacy/credential/factual-claim issues, stop, record the
  finding in `var/verification/personal-site/latest/checker-report.md`, and mark the target blocked in
  the manifest.
- Report failures honestly. Do not weaken thresholds, delete failing checks, mask dynamic regions,
  or approve content merely to turn the manifest green.

## Regression scope

Every pass verifies the changed target, its primary interaction, one adjacent target, desktop
layout, navigation, content privacy, console/network health, and build output. Deep pre-ship
verification must rerun all currently unblocked target IDs even if only one changed.
