# Performance and project-state workflow

## Pipeline

```text
capacity preflight → raw assets → normalize once → source units → management clusters
→ relationship route selection → structure state → batched Scene modules → incremental QA → publish once
```

Run preparation once:

```bash
node scripts/run-creative-workflow.mjs prepare <source-file-or-directory> <project-dir> [options.json]
```

This first writes `capacity-report.json`, then writes `asset-manifest.json`, `management-clusters.json`, `expression-routes.json`, `project-state.json`, `build-manifest.json`, generated `session-brief.md`, and a stage-timed `performance-report.json`. Cached normalized assets live under `<project-dir>/.work/normalized/<sourceHash>/`. Scene edits never invalidate that cache.

The reference-capacity preflight is deterministic and must finish within 20 seconds. Its current reference boundary is 30 source files, 100 known pages, and 180 MB raw input. It warns that PDF scan status is confirmed only after normalization. Over-capacity input is not summarized or dropped; it is identified so the Agent can request pre-OCR, split work, or parallel owners without making a false 30-minute promise.

## Asset normalization contract

| Source | Fixed normalized result |
|---|---|
| DOCX | paragraphs, tables, images, positions, and cached page visuals when available |
| PPTX | text, notes, media, chart data, and one cached page-render strategy |
| XLSX | cells, formulas, sheets, and chart data for HTML redraw |
| PDF | text layer, page numbers, and cached page images; scans enter the explicit OCR path |
| HTML | DOM modules, local resources, and necessary screenshots |
| PNG/JPG | original image, dimensions, hash, and OCR only when text understanding is requested |

The first successful strategy is recorded in `asset-manifest.json`. A Scene edit must not reopen an Office source. Only a changed `sourceHash` invalidates its normalized asset. Uncertain Office fidelity becomes `needs-asset-review`; the workflow never silently switches renderers between revisions.

## Structure lifecycle

- `exploring`: management questions, Scene count, order, and narrative may change. Publish is forbidden.
- `soft-frozen`: management questions and Scene IDs are stable; small order and internal composition changes are allowed.
- `frozen`: Scene IDs, order, and responsibilities are fixed. Copy, data, and local visual changes are allowed; structural changes unfreeze the project.

Use `core/scripts/project-state.mjs` to change state. `publish` is legal only when frozen and open issues are empty.

## QA profiles

```bash
node scripts/run-creative-workflow.mjs review <project-dir> [--preview-pdf]
node scripts/run-creative-workflow.mjs revision <project-dir> [--preview-pdf]
node scripts/run-creative-workflow.mjs publish <project-dir>
```

- Review: all current Scenes at desktop; creates `report.html`. Add `--preview-pdf` only when the user actually needs a PDF preview.
- Revision: affected Scenes at desktop; does not regenerate PDF unless requested.
- Publish: all Scenes at desktop, laptop, print, interaction, edit-geometry, and collision gates. Phone viewports are not part of authoring or QA. One browser session creates the current PDF and `publish-snapshot.json`; native PPTX extraction reuses the verified layout snapshot instead of launching another browser.

A successful Publish also writes `delivery-manifest.json` and sets `project-state.deliveryStatus=formal-ready`. Review and Revision can never create that state.

All three profiles assemble into `.work/candidates/` first. Only a candidate that passes its profile's real checks may replace root artifacts; `build-manifest.json` is promoted last. Failure leaves the last-good report and build manifest untouched, writes `.work/last-attempt.json`, and marks current source state `repair-required`. Never inspect the old report as evidence for the rejected revision.

Revision derives affected Scenes from Scene HTML/CSS, the Scene contract, referenced field values, art direction, asset bytes, and Skill implementation. Unchanged compiled fragments are reused. It records `compiledSceneIds`, `reusedSceneIds`, `normalizationRuns`, script/model-call counts, and elapsed time in `performance-report.json`. No-change revisions exit without revalidation.

HTML field edits update the embedded model immediately but debounce SHA-256 calculation for 400ms. Workfile save recomputes the mutable model and manifest hashes; immutable source and asset hashes are reused. Handoff/merge still verifies the complete package.

If preparation proposes more than eight Scenes, stop at `needs-confirmation` unless the user has confirmed the Scene plan. Set `scenePlanConfirmed: true` in the prepare options only after that confirmation. This prevents a long draft from receiving full visual treatment before its management questions and order are stable.

Do not run custom screenshot-to-PDF loops or duplicate the workflow with ad hoc scripts. Review is the cheap structure/desktop pass, Revision checks affected Scenes only, and Publish is the single full-delivery pass.

After a successful Review or Revision, run `pack-section` exactly once. It verifies the current static and desktop-browser reports, embeds the package, reads it back, compares model and file hashes, and atomically promotes the `.mint-section.html`. A passing handoff becomes `soft-frozen/review-ready`. Do not pack failed or intermediate candidates.

## 30-minute release gate

The release benchmark is one task card, three owners working in parallel, eight outline items, 8–12 Scenes, at most 10 ordinary source files per owner, at most 100 text-layer pages in total, no pending scan OCR, and no web research. Human review/waiting time is excluded. The candidate must complete three consecutive benchmark runs within 30 minutes without lowering any source, editability, routing, offline, visual, PPTX, or PDF gate.

Targets inside that wall-clock budget:

- task card: 10 seconds;
- first editable workfile per owner: 12 minutes, in parallel;
- ordinary affected-Scene revision: 3 minutes;
- three-section deterministic merge: 30 seconds;
- 12-Scene final QA plus HTML/PPTX/PDF: 3 minutes.

If a target is missed, inspect `capacity-report.json` and `performance-report.json`. Never delete source units, skip full editability, force a template, or disable final gates to make the number pass.

## Context governance

On continuation, read `project-state.json` and `session-brief.md` first. Load only affected Scene files and referenced atoms. JSON is authoritative; `session-brief.md` is generated and must not be hand-edited. Do not use chat history as the project database.

## Scene source rules

- Each Scene is `src/scenes/<stable-scene-id>.html` plus `.css`.
- Every selector begins with `[data-scene-id="<stable-scene-id>"]`.
- Every formal element uses stable `data-element-id`, `data-content-id`, and `data-field-path` values that do not depend on page order.
- Every geometry-relevant element declares `data-qa-role`, `data-qa-group` when needed, and `data-qa-overlap`.
- Final HTML assets are enumerated from actual references and inlined; unreferenced files are not packaged. External, missing, outside-project, imported CSS, script, frame, or unsupported assets stop as `needs-asset-review` rather than remaining as hidden network dependencies.
- Remove `data-scene-status="placeholder"` only after deliberately composing the Scene.
- The assembly script produces the offline single HTML. Never patch the bundled report as the source.
