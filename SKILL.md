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
2. Read `references/performance-workflow.md`. Start with `scripts/run-creative-workflow.mjs prepare`. It normalizes raw assets once, compiles stable source units, clusters them by management question, and creates repository state. Never repeatedly reopen unchanged Office/PDF sources.
3. If status is `needs-confirmation`, ask only about the listed fact boundary or capacity issue. Do not reduce the source map to pass.
4. Establish one coherent art direction for the full report. Read `references/creative-art-direction.md`.
5. Author each Scene in `src/scenes/<scene-id>.html` and `.css`. Keep stable semantic IDs and namespace every Scene selector. Run `scripts/run-creative-workflow.mjs review` to assemble the self-contained `report.html`; do not hand-maintain the bundle.
6. Build one scene per management question. On desktop and in PDF, compose the main scene on a fixed 1920×1080 `.mint-scene__stage` and scale the stage uniformly; on mobile, use a controlled same-content reflow that preserves field order and hierarchy. Use `scroll-snap: proximity`, not mandatory snapping.
7. Keep every `mustShow` item visible without interaction. Put only supporting detail in expandable regions. In print mode, expand all required detail.
8. Add stable `data-scene-id`, `data-atom-ref`, `data-field-path`, and `data-edit-policy` attributes. Every main title must also include `data-title-contract` and `data-title-role`. Never create unsupported facts to complete a composition.
9. Every generated HTML must include the shared creative runtime. It must always provide visible previous/next controls, Left/Right and Up/Down keyboard navigation, a visible edit button with `E`, and a visible clear-screen control with `H`/`Esc` restore. Every formal text field is editable unless its contract explicitly marks it `derived` or `locked` with an allowed `data-edit-reason`; this requirement does not depend on the user's prompt.
10. Add only meaningful motion and interaction. Read `references/scrollytelling-contract.md`.
11. Use `review` for the first draft, `revision` for changed Scenes only, and `publish` only after `structureState=frozen`. Review checks desktop and produces HTML only; add `--preview-pdf` only when requested. Publish checks all viewports and produces the formal `report.pdf`. If preparation proposes more than eight Scenes, confirm the management-question plan before visual authoring.
12. Repair collisions or structure in the Scene source. One automatic geometry repair is allowed; a second failure becomes `needs-layout-review`. Never shrink text repeatedly or switch to an unrelated template.

## Repository is state

Chat contains instructions; the project directory contains truth. At the start of an existing project, read only `project-state.json`, generated `session-brief.md`, affected Scene modules, necessary Source Units, and open issues. Do not reload all sources, screenshots, prior QA logs, or the bundled HTML unless a source hash or structure changed.

`structureState` and `qaProfile` are independent. `exploring` permits structural work, `soft-frozen` keeps Scene identity while allowing small order changes, and `frozen` locks Scene order and responsibilities. Only frozen projects may Publish. Copy, data, or local visual edits keep the structure frozen but make affected outputs stale.

## Creative freedom

Mint brand anchors are fixed: logo treatment, typography hierarchy, original Scheme C tokens, source treatment, and Chinese readability. Light and white surfaces should occupy about 72%–88% of a scene; jade usually occupies 8%–18%; data blue and coral together usually stay below 8%. Jade marks brand and primary emphasis, blue marks data and comparison, and coral marks risk, action, gaps, and alerts. Full-page dark scenes and warm beige/copper surfaces are not the default. Codex remains free to choose spatial composition, illustration language, chart treatment, motion, pacing, and interaction inside these semantic boundaries.

Do not default to cards, dashboards, or one visual component per scene. Fixed 16:9 is a composition coordinate system for desktop/PDF, not a fixed card template. A scene may combine diagrams, charts, formulas, media, and explanation when that improves understanding.

## Hard gates

- Every original source unit has a recorded destination.
- Unauthorized new facts, entities, numbers, and formal conclusions are zero.
- Key numbers, risks, actions, and boundaries are visible and traceable.
- Parallel, sequence, temporal, causal, comparison, and hierarchy relations are expressed truthfully.
- Chinese titles use role-based size ranges, zero negative tracking, no more than two rendered lines, semantic breaks, no punctuation at line start, and no orphan line shorter than three visible characters. Repair in this order: remove repetition, choose semantic breaks, resize the title region, change to a verified long-title composition, adjust within the role range, move supporting detail or add a scene, then block delivery.
- Every scene has one reading start, one management answer, and an explainable reading path.
- Every formal text, connector, node, media, and decoration has a geometry contract. Lines, markers, media, or decorative layers may not cover readable text. Illegal collisions block delivery after one deterministic repair attempt.
- Scene selectors are scoped to their stable `data-scene-id`. Scene CSS may not target `html`, `body`, `:root`, Runtime controls, or use `!important`.
- Adjacent scenes do not mechanically repeat the same silhouette without a recorded reason.
- Motion expresses entrance, progression, comparison, change, or focus; it is never decorative noise.
- Navigation, keyboard movement, details, tabs, charts, media enlargement, and reduced-motion mode work when present.
- Previous/next controls, Left/Right navigation, the visible edit control, `E` editing, and `H` clear-screen mode are mandatory. Coverage is calculated from every actually visible report text run, not from fields already declared editable. Ordinary visible text must be editable; `locked` or `derived` text requires an allowed reason. Coverage is 100%, coarse container-level edit contracts are forbidden, and runtime controls may not overlap formal fields.
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
