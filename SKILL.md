---
name: mint-report-html
description: Create source-grounded Mint management reports as dynamic, offline, fully editable HTML workfiles; support parallel section authoring, deterministic merge, and final native editable PPTX/PDF publication. Use by default for Mint reports, management briefs, project updates, operating reviews, HTML-first authoring, or collaborative report production. Preserve facts and sources, compile Chinese logic first, then art-direct scenes within Mint brand anchors.
---

# Mint Report HTML

Create the best presentation-quality HTML for the material while protecting everything that must not be wrong. This skill constrains facts, logic, sources, Chinese readability, interaction accessibility, export state, and QA. It deliberately does not prescribe fixed card grids, slide masters, coordinates, or a pattern registry.

## Route correctly

Use this skill for the generic request “帮我做 Mint 汇报”; for dynamic, interactive, scrolling, web-first, or HTML-first materials; and when several people must author separate sections, preview and edit them, merge them, then publish one HTML/PPTX/PDF report.

An editable PPTX requested as the final collaborative deliverable does not by itself route away from this Skill. Use `mint-report-deck` instead only for PPT-only work, exact or maximum page count, strict HTML/PPTX geometry parity, or a formal cross-format audit. Never modify `mint-report-deck` while repairing this Skill.

## Required workflow

1. Read all supplied material before designing. Do not browse for business facts unless the user explicitly requests it. Never route from the number count alone.
2. Read `references/performance-workflow.md` and `references/page-consolidation.md`. Start with `scripts/run-creative-workflow.mjs prepare`. It writes a capacity report, normalizes raw assets once, compiles stable source units, clusters them by management story, runs page consolidation, and writes `expression-routes.json`. Data routing must use relation types together with metrics, categories, periods, values, units, sign changes, and decision intent; a generic `parallel` tag may not override an evident time series, break-even, valuation, budget bridge, funnel, ownership, gate, or flow relationship. Read only the matching guidance for the current Scene; read the full `references/data-expression-routing.md` only for ambiguous routing or a routing audit. Never repeatedly reopen unchanged Office/PDF sources.
3. If status is `needs-confirmation`, ask only about the listed fact boundary or capacity issue. Do not reduce the source map to pass.
4. Establish one coherent art direction for the full report. Read `references/creative-art-direction.md`.
5. When two or more owners author separate sections, read `references/collaboration-workflow.md`; use `references/user-operation-guide.md` when explaining the process to colleagues. One designated coordinator creates exactly one `report.mint-task.json` after the team has assigned outline items. It carries stable section IDs, order, Skill version, and an automatic design contract; it does not ask users to choose visual rules. Each owner runs prepare/review on only their material and receives one `.mint-section.html` workfile. The canonical package exists inside that HTML from the first draft. Users save the same workfile; technical ZIP export is optional. Merge current HTML workfiles with `scripts/collaboration-package.mjs merge`; do not merge finished PPT files, concatenate HTML, or summarize sections again.
6. Author each Scene in `src/scenes/<scene-id>.html` and `.css`. Keep stable semantic IDs and namespace every Scene selector. Run `scripts/run-creative-workflow.mjs review` to assemble the self-contained `report.html`; do not hand-maintain the bundle.
7. Build the minimum number of Scenes needed for complete management conclusions. Every candidate Scene must have a non-placeholder management question and stable `decisionKey`. One outline item recommends one integrated Scene and may use a second only for an independent decision or verified capacity conflict; more than two requires plan review before visual authoring. One Scene may combine evidence, mechanism, risk, action, charts, tables, and explanation when they answer the same overarching management question. Before creating a new Scene, apply the title-removal and support-module tests in `references/page-consolidation.md`; expression roles never justify a page by themselves. On desktop and in PDF, compose the main scene on a fixed 1920×1080 `.mint-scene__stage` and scale the stage uniformly. Use `scroll-snap: proximity`, not mandatory snapping. Mobile authoring and mobile QA are outside the standard workflow; never change report wording or structure only to satisfy a phone viewport.
8. Keep every `mustShow` item visible without interaction. Put only supporting detail in expandable regions. In print mode, expand all required detail.
9. Add stable `data-scene-id`, `data-atom-ref`, `data-field-path`, and `data-edit-policy` attributes. Every main title must also include `data-title-contract` and `data-title-role`. Use `data-edit-kind=table|chart|media|diagram` and a matching structured entry in `report-model.json` for non-text business objects. Never create unsupported facts to complete a composition.
10. Every generated HTML must include the shared creative runtime. It must always provide visible previous/next controls, Left/Right and Up/Down keyboard navigation, a visible edit button with `E`, and a visible clear-screen control with `H`/`Esc` restore. Every formal text field and typed business object is editable unless its contract explicitly marks it `derived` or `locked` with an allowed `data-edit-reason`; this requirement does not depend on the user's prompt.
11. Add only meaningful motion and interaction. Read `references/scrollytelling-contract.md`. Only when authored relationships need linked exploration, also read `references/relationship-interactions.md`; ordinary reports do not create or bundle an interaction module.
12. Use `review` for the first draft, `revision` for changed Scenes only, and `publish` only after `structureState=frozen`. When a leader edited and saved a section or merged workfile, unpack that current HTML before revision or publish; never publish a stale pre-review project directory. Review and revision check desktop only and produce HTML only; add `--preview-pdf` only when requested. Do not invoke the same browser QA again after a workflow command, do not pack intermediate candidates, and do not run whole-report QA after a local revision. `pack-section` is the one final section handoff: it requires a passing Review/Revision, round-trip verifies the embedded package, and sets the section to `soft-frozen/review-ready`. Publish checks desktop, laptop, and print/PDF, then produces formal HTML/PDF and creates native editable PPTX when `report-brief.json` requests it. It never runs a phone viewport. Load the workspace presentation runtime and follow the Presentations Skill before PPTX publication. If preparation proposes more than eight Scenes, confirm the management-question plan before visual authoring.
13. Repair collisions or structure in the Scene source. One automatic geometry repair is allowed; a second failure becomes `needs-layout-review`. Never shrink text repeatedly or switch to an unrelated template.

## Repository is state

Chat contains instructions; the project directory contains truth. At the start of an existing project, read only `project-state.json`, generated `session-brief.md`, affected Scene modules, necessary Source Units, and open issues. Do not reload all sources, screenshots, prior QA logs, or the bundled HTML unless a source hash or structure changed.

`structureState` and `qaProfile` are independent. `exploring` permits structural work, `soft-frozen` keeps Scene identity while allowing small order changes, and `frozen` locks Scene order and responsibilities. Only frozen projects may Publish. Copy, data, or local visual edits keep the structure frozen but make affected outputs stale.

## Creative freedom

Mint brand anchors are fixed: logo treatment, typography hierarchy, original Scheme C tokens, source treatment, and Chinese readability. Light and white surfaces should occupy about 72%–88% of a scene; jade usually occupies 8%–18%; data blue and coral together usually stay below 8%. Jade marks brand and primary emphasis, blue marks data and comparison, and coral marks risk, action, gaps, and alerts. Full-page dark scenes and warm beige/copper surfaces are not the default. Codex remains free to choose spatial composition, illustration language, chart treatment, motion, pacing, and interaction inside these semantic boundaries.

Do not default to cards, dashboards, or one visual component per scene. Fixed 16:9 is a composition coordinate system for desktop/PDF, not a fixed card template. A scene may combine diagrams, charts, formulas, media, and explanation when that improves understanding.

## Hard gates

- Every original source unit has a recorded destination.
- Audit metadata and audience-facing report content are separate contracts. Task-card paths, owner IDs, outline indices, source-unit IDs, hashes, merge lineage, raw filenames, `report.mint-task.json`, and labels such as `任务边界` or `大纲 2` remain available in the embedded package and ledgers but must never be rendered in HTML, PDF, or PPTX. This is an absolute publication gate, not a visual preference. Show only source-backed business content and qualifiers necessary to interpret it, such as a real unit, period, scope, or decision-critical caveat; show a citation only when the user explicitly requests visible citations.
- Unauthorized new facts, entities, numbers, and formal conclusions are zero.
- Key numbers, risks, actions, and boundaries are visible and traceable.
- Parallel, sequence, temporal, causal, comparison, and hierarchy relations are expressed truthfully.
- Chinese titles use role-based size ranges, zero negative tracking, no more than two rendered lines, semantic breaks, no punctuation at line start, and no orphan line shorter than three visible characters. Repair in this order: remove repetition, choose semantic breaks, resize the title region, change to a verified long-title composition, adjust within the role range, move supporting detail or add a scene, then block delivery.
- Every scene has one reading start, one management answer, and an explainable reading path.
- Balanced and compact management Scenes use the canvas intentionally: related sourced modules are consolidated before pagination, short tables are not stretched into tall empty containers, and unexplained continuous empty bands fail visual QA. Focused opening and section-divider Scenes are exempt from density forcing.
- Every formal text, connector, node, media, and decoration has a geometry contract. Lines, markers, media, or decorative layers may not cover readable text. Illegal collisions block delivery after one deterministic repair attempt.
- Scene selectors are scoped to their stable `data-scene-id`. Scene CSS may not target `html`, `body`, `:root`, Runtime controls, or use `!important`.
- Adjacent scenes do not mechanically repeat the same silhouette without a recorded reason.
- Motion expresses entrance, progression, comparison, change, or focus; it is never decorative noise.
- Navigation, keyboard movement, details, tabs, charts, media enlargement, and reduced-motion mode work when present.
- Optional relationship interactions use existing sourced fields and authored edges. Guides never create relationships; reachability never claims causality; parallel content never gains arrows. Custom HTML/SVG is equally supported and receives the same gates.
- Previous/next controls, Left/Right navigation, the visible edit control, `E` editing, and `H` clear-screen mode are mandatory. Coverage is calculated from every actually visible report text run, not from fields already declared editable. Ordinary visible text must be editable; `locked` or `derived` text requires an allowed reason. Coverage is 100%, coarse container-level edit contracts are forbidden, and runtime controls may not overlap formal fields.
- Tables, charts, media, and diagrams are editable through typed editors and persist into the embedded section/report package. Title-only editability is a failure.
- Edit mode may not shrink a field below 95% of its normal width or hide unreachable text. Every typed editor must expose a complete input surface at the supported viewport. Save, close, reopen, and re-read are browser gates.
- Collaboration package IDs are namespaced on merge; workfile report ID, section completeness, design contract, SHA-256 integrity, and revision lineage are hard gates. File names are not identities. Identical hashes deduplicate; a strict descendant wins; same-revision differences or divergent lineage block. Merge preserves source ledgers and user edits and may not summarize the sections again.
- Final PPTX is always 16:9 with no header, footer, or page number. It uses native editable text, table, chart, media, shape, and diagram objects; a full-slide screenshot is forbidden. HTML-only motion and hover behavior may degrade to a static state, but content, order, data, titles, and sources must match the shared model.
- Necessary information remains complete with motion disabled and in PDF.
- A PDF is not current merely because the file and hash exist. Its page count must match the Scene count, every page must have a correctly scaled 16:9 content stage, and blank or near-blank pages block delivery.
- A candidate replaces the last-good report only after its applicable static, browser, interaction, geometry, and PDF gates pass. A failed candidate remains failed; the previous report is not evidence that the new revision passed.
- A failed visual direction may be regenerated once. If it still fails, stop; never fall back to the old card template.

## Deliverables

- `report.html`
- `report.pdf`
- `report.pptx` when requested in `report-brief.json`
- `report-model.json`
- `creative-brief.json`
- `content-map.json`
- `source-ledger.json`
- `qa-report.json`

In collaboration mode each owner receives one editable `.mint-section.html`; the merged project receives one editable `.mint-report.html`. The embedded package can be unpacked for Agent revisions or exported as a technical ZIP, but it is not a routine user step. Final HTML, PPTX, and PDF must be generated from the same current `report-model.json`, never from separate summaries, DOM reverse extraction, or a screenshot.
