---
name: mint-report-html
description: Create source-grounded Mint management reports as visually distinctive, dynamic scrolling HTML with an offline single-file deliverable and a current-state PDF. Use by default when a user asks to make a Mint report, management brief, project update, operating review, or interactive HTML without explicitly requiring PPTX, fixed page count, or strict cross-format geometry. Preserve facts and sources, compile Chinese logic first, then let Codex freely art-direct the scenes within Mint brand anchors.
---

# Mint Report HTML

Create the best presentation-quality HTML for the material while protecting everything that must not be wrong. This skill constrains facts, logic, sources, Chinese readability, interaction accessibility, export state, and QA. It deliberately does not prescribe fixed card grids, slide masters, coordinates, or a pattern registry.

## Route correctly

Use this skill for the generic request “帮我做 Mint 汇报” and for dynamic, interactive, scrolling, web-first, or HTML-first materials.

Use `mint-report-deck` instead when the user explicitly requires PPTX, an exact or maximum page count, HTML/PPTX structural parity, or formal multi-format audit. High-risk subject matter requires fact confirmation but does not by itself switch the visual mode.

## Required workflow

1. Read all supplied material before designing. Do not browse for business facts unless the user explicitly requests it.
2. Run `scripts/prepare-creative.mjs` on the raw source. Treat its `source-lock.json`, `content-map.json`, `creative-brief.json`, and `source-ledger.json` as the source of truth.
3. If status is `needs-confirmation`, ask only about the listed fact boundary or capacity issue. Do not reduce the source map to pass.
4. Establish one coherent art direction for the full report. Read `references/creative-art-direction.md`.
5. Create a self-contained `report.html`. Inline CSS, JavaScript, icons, charts, and necessary media. The first screen must have no network dependency.
6. Build one scene per management question. A scene has `min-height: 100svh` but may grow naturally. Use `scroll-snap: proximity`, not mandatory snapping.
7. Keep every `mustShow` item visible without interaction. Put only supporting detail in expandable regions. In print mode, expand all required detail.
8. Add stable `data-scene-id`, `data-atom-ref`, `data-field-path`, and `data-edit-policy` attributes. Never create unsupported facts to complete a composition.
9. Add only meaningful motion and interaction. Read `references/scrollytelling-contract.md`.
10. Run `scripts/qa-creative-html.mjs`; then run `scripts/visual-qa-creative.mjs` at 1920×1080, 1280×720, and 390×844. Repair the structured source or art direction, not merely the generated DOM.
11. Export `report.pdf` with `scripts/export-creative-pdf.mjs`. Verify its content hash matches the current embedded creative model.

## Creative freedom

Mint brand anchors are fixed: logo treatment, typography hierarchy, core green family, source treatment, and Chinese readability. Codex may freely choose light or dark scenes, supporting colors, spatial composition, illustration language, chart treatment, motion, pacing, and interaction.

Do not default to cards, dashboards, fixed 16:9 canvases, or one visual component per scene. A scene may combine diagrams, charts, formulas, media, and explanation when that improves understanding.

## Hard gates

- Every original source unit has a recorded destination.
- Unauthorized new facts, entities, numbers, and formal conclusions are zero.
- Key numbers, risks, actions, and boundaries are visible and traceable.
- Parallel, sequence, temporal, causal, comparison, and hierarchy relations are expressed truthfully.
- Chinese titles break at semantic boundaries; no overflow or unreadably small type.
- Every scene has one reading start, one management answer, and an explainable reading path.
- Adjacent scenes do not mechanically repeat the same silhouette without a recorded reason.
- Motion expresses entrance, progression, comparison, change, or focus; it is never decorative noise.
- Navigation, keyboard movement, details, tabs, charts, media enlargement, and reduced-motion mode work when present.
- Necessary information remains complete with motion disabled and in PDF.
- A failed visual direction may be regenerated once. If it still fails, stop; never fall back to the old card template.

## Deliverables

- `report.html`
- `report.pdf`
- `creative-brief.json`
- `content-map.json`
- `source-ledger.json`
- `qa-report.json`

If the user later asks for PPTX, reuse the original `content-map.json` and `source-ledger.json` with `mint-report-deck`. Never reverse-extract the HTML as the source.
