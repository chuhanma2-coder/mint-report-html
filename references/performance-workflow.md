# Performance and project-state workflow

## Pipeline

```text
raw assets → normalize once → source units → management clusters
→ structure state → Scene modules → incremental QA → publish
```

Run preparation once:

```bash
node scripts/run-creative-workflow.mjs prepare <source-file-or-directory> <project-dir> [options.json]
```

This writes `asset-manifest.json`, `management-clusters.json`, `project-state.json`, `build-manifest.json`, and generated `session-brief.md`. Cached normalized assets live under `<project-dir>/.work/normalized/<sourceHash>/`. Scene edits never invalidate that cache.

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
node scripts/run-creative-workflow.mjs review <project-dir>
node scripts/run-creative-workflow.mjs revision <project-dir> [--preview-pdf]
node scripts/run-creative-workflow.mjs publish <project-dir>
```

- Review: all current Scenes at desktop; creates `report.html` and `report-preview.pdf`.
- Revision: affected Scenes at desktop; does not regenerate PDF unless requested.
- Publish: all Scenes at desktop, laptop, mobile, print, interaction, and collision gates; creates formal PDF.

A successful Publish also writes `delivery-manifest.json` and sets `project-state.deliveryStatus=formal-ready`. Review and Revision can never create that state.

## Context governance

On continuation, read `project-state.json` and `session-brief.md` first. Load only affected Scene files and referenced atoms. JSON is authoritative; `session-brief.md` is generated and must not be hand-edited. Do not use chat history as the project database.

## Scene source rules

- Each Scene is `src/scenes/<stable-scene-id>.html` plus `.css`.
- Every selector begins with `[data-scene-id="<stable-scene-id>"]`.
- Every formal element uses stable `data-element-id`, `data-content-id`, and `data-field-path` values that do not depend on page order.
- Every geometry-relevant element declares `data-qa-role`, `data-qa-group` when needed, and `data-qa-overlap`.
- Remove `data-scene-status="placeholder"` only after deliberately composing the Scene.
- The assembly script produces the offline single HTML. Never patch the bundled report as the source.
