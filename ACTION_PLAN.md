# v0.12.0-rc.1 — one workfile, safe asynchronous review, faster final publish

Baseline: standalone `mint-report-html` at `ff3af18`. `mint-report-deck` is out of scope and must not be modified.

| Item | Change / acceptance | Status |
|---|---|---|
| 01 | Complete data-relationship routing and anti-rules; never chart by number count alone | DONE |
| 02 | Preserve PPTX cached chart type, categories, series and values during one-time normalization | DONE |
| 03 | One canonical editable model for text, table, chart, media and diagram | DONE |
| 04 | One self-contained editable section HTML with embedded package and optional technical ZIP | DONE |
| 05 | Rename-safe deterministic merge with lineage dedupe/descendant selection/divergence blocking | DONE |
| 06 | Native 16:9 final PPTX, no page chrome, plus current-state PDF; no full-slide screenshots | DONE |
| 07 | Browser E2E, format/visual tests, publish timing, compatibility and installed-Skill update | DONE |
| 08 | One coordinator-created task card with automatic Skill/design contract | DONE |
| 09 | Direct workfile save, Cmd/Ctrl+S, 400ms hash debounce and edit-geometry gates | DONE |
| 10 | Capacity preflight, route selector and single-browser publish snapshot | DONE |

## Acceptance target

- Each owner can preview and edit their own part before merge.
- Text, tables, charts, media and diagrams can be edited in HTML and persist in the embedded package after save/reopen.
- Merging two or more independently authored sections does not collide on IDs, page numbers, image sizes or background rules.
- The full merged HTML remains editable.
- Final PPTX is 16:9, contains native editable objects, and has no header, footer or page number.
- Final PDF and PPTX reflect the current shared model.
- Source units and declared relations are not silently removed, rewritten or supplemented.
- Expensive Office normalization is cached; PPTX/PDF are created only at final publish.

## Explicit non-goals

- No fixed whitelist of six page types.
- No fixed slide-master layout library that forces repeated templates.
- No claim of pixel-identical HTML/PPTX interaction.
- No new unrelated features and no changes to `mint-report-deck`.

## Validation evidence

- Browser E2E passed: text, chart, table, media and diagram edits persisted through direct workfile save, merge and full-report save.
- Final Publish passed desktop, laptop, mobile, print, edit, navigation, PDF-current and PPTX-current gates with zero issues.
- Two-page publish fixture completed in about 11.0 seconds after inputs were normalized, versus the prior 16.9-second evidence; this is not an unconditional promise for arbitrary reports.
- PPTX manifest recorded 4 native text objects plus native chart, table, media and diagram objects; 16:9 and no-page-chrome checks passed.
- Static compatibility, asset caching, source compilation, interaction contracts, rollback, editability, routing and package-integrity tests passed.
- Historical interaction, incremental workflow, geometry, edit/save/package, large-workfile and final-publish browser suites all passed.
- A 60 MB embedded asset produced an 80.1 MB single workfile; Chrome opened it in 593 ms and built the saved version in 566 ms.
- The deterministic three-owner, eight-outline-item, 12-Scene merge/publish benchmark passed three consecutive runs in 12.274 s, 9.778 s and 10.791 s. This measures the Skill pipeline, not model queue or human review time.
- Chrome 152 on local `file://` exposed `showSaveFilePicker`; direct-write integration and the one-HTML fallback both passed.
- Pre-v0.12 repository state is backed up at `mint-report-html.backup-20260902-pre-v012`.
- The prior installed Skill is backed up at `/Users/mac/.codex/skills/mint-report-html.backup-20260902-120916`. Candidate/installed trees matched, Skill validation passed, and installed-path static plus browser publish tests passed.
