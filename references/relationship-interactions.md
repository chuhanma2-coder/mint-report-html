# Optional relationship interactions

Read this only when a Scene contains an authored relationship that benefits from focus, reachability, route tracing, or guided explanation. Ordinary reports do not need an interaction module and do not bundle its runtime.

## Authoring boundary

The optional module is data, not a layout. Codex owns the whole Scene composition and may use normal HTML/CSS/SVG. Do not choose a module because several items happen to exist.

- `workflow`: authored sequence, branch, or dependency.
- `sequence`: temporal or message order.
- `dataflow`: an explicit data movement.
- `lifecycle`: an explicit state transition; cycles are legal.
- `architecture`: dependency, containment, or association; only association may be undirected.

Each module in `creative-brief.json.scenes[].interactiveModules` needs a stable `id`, a reader-facing `goal`, sourced `nodes`, sourced `edges`, and optional `guidedViews`. Node labels reference existing string fields such as `atoms.A3`; do not duplicate their text. A guide changes attention only and never creates an edge. Upstream/downstream describes authored direction only; do not call it impact, causality, or breakage without source evidence.

## Scene DOM

The authored Scene chooses geometry. Bind these semantic identities:

```html
<div data-module-id="approval-flow">
  <div data-interaction-controls data-ui-control></div>
  <article data-node-id="review" data-qa-role="node" ...>
    <p data-field-path="atoms.A3" data-edit-policy="editable" ...>审核</p>
  </article>
  <svg data-auto-route aria-hidden="true">
    <path data-edge-id="E1" data-edge-from="review" data-edge-to="approve"
      data-element-id="edge-E1" data-qa-role="connector"
      data-qa-group="approval-flow" data-qa-overlap="allow-same-group" />
  </svg>
</div>
```

`data-auto-route` is optional. It distributes ports and redraws connectors after responsive reflow; omit it for deliberately authored paths. Both forms receive browser geometry QA. Keep labels in editable HTML, not SVG text.

Required behavior is supplied by the shared runtime: node focus, authored reachability, directed path probe, bounded guide, and reset. It does not use global shortcuts, infer graph objects from proximity, change page layout, shrink text, or hide unselected facts.

## Failure behavior

Unresolved fields, unknown endpoints, unsupported relationships, unreferenced nodes/edges, missing source references, parallel content with directed arrows, temporal/containment cycles, DOM/model mismatch, connector clearance, or wrong ports block the candidate. Repair the structured source or Scene geometry. Do not delete the module, invent a relation, or switch to an unrelated visual to pass.
