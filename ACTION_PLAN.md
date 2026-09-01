# v0.10.0-rc.1 — creative freedom, reusable interactions

Baseline: standalone mint-report-html `43e3440`. Do not modify mint-report-deck or historical reports.

| Item | Change / acceptance | Status |
| --- | --- | --- |
| 01 | Extend existing brief, optional typed graph and canonical fields; no second model pass; old reports build | DONE |
| 02 | Opt-in focus, reachability, directed route and authored guide; no inferred business edges; E/H/arrows preserved | DONE |
| 03 | Browser-measured connector clearance, endpoints, labels; one repair only; no smaller-font bypass | DONE |
| 04 | Referenced-asset offline bundle, cache reuse, current-field PDF; export restores interaction state | DONE |
| 05 | Candidate QA before promotion; last-good survives failure; only changed scenes revalidate on revision | DONE |
| 06 | Minimal Skill entrypoint, optional reference, pinned upstream provenance | DONE |
| 07 | Raw-input forward tests, browser/edit/PDF checks, timings, RC publication; manual visual review before stable | DONE |

Tests run per item. Evidence and limitations recorded here; JSON validation alone does not prove visual or semantic quality.

## RC evidence

- Static/contract: V0.9 compatibility, Scheme C, six-format normalization and caching, visible-text edit coverage, optional interaction semantics, referenced-only inlining, and candidate rollback passed.
- Browser: real glyph/SVG/media collision tests passed; previous/next, E, H, reduced-motion and print checks passed.
- Forward input: five untouched Chinese source units produced two management Scenes; explicit progression became a sourced workflow, numbered parallel facts did not become arrows.
- Interaction: focus, authored upstream, directed route, no-route result, guide-without-new-edge, responsive auto-routing, field mirrors, offline load, and reset-on-export passed.
- PDF: deterministic export and localhost one-click download produced `%PDF` from the edited field model and matching content hash; edit/focus state restored afterward.
- Incremental: two successive one-Scene changes checked and compiled only that Scene, reused one unchanged Scene, ran zero normalization/model calls, and kept PDF stale. Observed Revision was 2.9–6.2s versus Publish 11.0–14.2s in two-Scene fixtures; these measurements are not a promise for real reports.
- Last-good: a full-page overlay failed after the one permitted repair; root `report.html` and `build-manifest.json` remained byte-identical, while source state became `repair-required`.
- Manual review at 1920×1080 and 390×844: the functional fixture had readable CJK labels, visible relationships, Scheme C colors, and no chrome/text overlap. It is a mechanics test, not a future report design template.

## Known limits before stable v0.10.0

- Explicit repeated-subject progression is recognized; arbitrary implicit business relations still require confirmation.
- Auto-route uses deterministic orthogonal connectors, not global graph optimization; dense graphs may correctly stop at `needs-layout-review`.
- One-click PDF requires the bundled loopback service. Without it, UI truthfully changes to `打印 / 导出 PDF`.
- This RC has macOS browser evidence. Windows browser execution remains unverified and must not be advertised as tested.
