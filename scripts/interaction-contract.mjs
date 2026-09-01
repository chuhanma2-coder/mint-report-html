// Optional semantic contract, deliberately independent of layout and frameworks.
const types = {
  workflow: new Set(["sequence", "branch", "dependency"]),
  sequence: new Set(["temporal", "message"]),
  dataflow: new Set(["dataflow"]),
  lifecycle: new Set(["transition"]),
  architecture: new Set(["dependency", "contains", "association"])
};
const idPattern = /^[A-Za-z][A-Za-z0-9_-]*$/;
export function getField(model, fieldPath) {
  let value = model;
  for (const part of String(fieldPath).split(".")) {
    if (["__proto__", "constructor", "prototype"].includes(part) || !Object.hasOwn(value || {}, part)) return undefined;
    value = value[part];
  }
  return value;
}
export function validateInteractions(scene, model) {
  const errors = [], modules = scene.interactiveModules || [], ids = new Set();
  if (!Array.isArray(modules)) return [`${scene.id}: interactiveModules must be an array`];
  const issue = (id, message) => errors.push(`${scene.id}/${id}: ${message}`);
  for (const mod of modules) {
    const id = mod?.id;
    if (!idPattern.test(id || "") || ids.has(id)) issue(id, "invalid or duplicate module ID");
    ids.add(id);
    if (!types[mod.type]) { issue(id, "unsupported relationship type"); continue; }
    if (!mod.goal?.trim()) issue(id, "interaction needs a reader goal");
    const nodes = mod.nodes || [], edges = mod.edges || [];
    if (!Array.isArray(nodes) || !nodes.length || !Array.isArray(edges)) { issue(id, "nodes/edges must be arrays, nodes nonempty"); continue; }
    if (nodes.length > 200 || edges.length > 500 || (mod.guidedViews || []).length > 5) { issue(id, "interaction exceeds bounded reader runtime"); continue; }
    const nodeIds = new Set(), edgeIds = new Set();
    const source = (item) => {
      if (!Array.isArray(item.sourceUnitRefs) || !item.sourceUnitRefs.length || item.sourceUnitRefs.some(ref => !scene.sourceUnitRefs.includes(ref))) issue(id, "node/edge lacks source references in this Scene");
    };
    for (const node of nodes) {
      if (!idPattern.test(node.id || "") || nodeIds.has(node.id)) issue(id, "invalid or duplicate node ID");
      nodeIds.add(node.id); source(node);
      if (typeof getField(model, node.fieldPath) !== "string") issue(id, `unknown text field ${node.fieldPath}`);
    }
    for (const edge of edges) {
      if (!idPattern.test(edge.id || "") || edgeIds.has(edge.id)) issue(id, "invalid or duplicate edge ID");
      edgeIds.add(edge.id); source(edge);
      if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) issue(id, "edge endpoint does not exist");
      if (!types[mod.type].has(edge.relation)) issue(id, `relation ${edge.relation} is not ${mod.type}`);
      if (typeof edge.directed !== "boolean") issue(id, "edge direction must be explicit");
      if (mod.type !== "architecture" && edge.directed !== true) issue(id, "ordered relationships require direction");
      if ((scene.relationTypes || []).every(r => ["parallel", "parallel-group", "independent"].includes(r)) && edge.directed) issue(id, "parallel content cannot acquire directed edges");
    }
    if ((mod.guidedViews || []).some(view => !Array.isArray(view.nodeIds) || !view.nodeIds.length || view.nodeIds.some(n => !nodeIds.has(n)))) issue(id, "guide references unknown nodes");
    // Containment and strict temporal order cannot form cycles. Workflows/lifecycles may.
    const ordered = edges.filter(e => e.directed && ["contains", "temporal"].includes(e.relation));
    const visit = (id, stack = new Set()) => {
      if (stack.has(id)) return true;
      return ordered.filter(e => e.from === id).some(e => visit(e.to, new Set([...stack, id])));
    };
    if ([...nodeIds].some(n => visit(n))) issue(id, "containment/temporal cycle");
  }
  return errors;
}

export function interactionDomAuditInPage() {
  const model = JSON.parse(document.querySelector("#mint-creative-data").textContent), errors = [];
  const field = (p) => p.split(".").reduce((v, k) => v?.[k], model);
  for (const scene of Object.values(model.sceneById)) {
    const root = [...document.querySelectorAll("section[data-scene-id]")].find(n => n.dataset.sceneId === scene.id);
    for (const mod of scene.interactiveModules || []) {
      const roots = [...root.querySelectorAll("[data-module-id]")].filter(n => n.dataset.moduleId === mod.id);
      if (roots.length !== 1) { errors.push(`${scene.id}/${mod.id}: missing/duplicate module`); continue; }
      for (const node of mod.nodes) {
        const nodes = [...roots[0].querySelectorAll("[data-node-id]")].filter(n => n.dataset.nodeId === node.id);
        const label = nodes[0]?.matches("[data-field-path]") ? nodes[0] : nodes[0]?.querySelector("[data-field-path]");
        if (nodes.length !== 1 || label?.dataset.fieldPath !== node.fieldPath || label?.textContent.trim() !== field(node.fieldPath)) errors.push(`${mod.id}/${node.id}: node field is not rendered from model`);
      }
      for (const edge of mod.edges) {
        const edges = [...roots[0].querySelectorAll("[data-edge-id]")].filter(n => n.dataset.edgeId === edge.id);
        if (edges.length !== 1 || edges[0].dataset.edgeFrom !== edge.from || edges[0].dataset.edgeTo !== edge.to) errors.push(`${mod.id}/${edge.id}: edge DOM mismatch`);
      }
      if (roots[0].querySelectorAll("[data-node-id]").length !== mod.nodes.length || roots[0].querySelectorAll("[data-edge-id]").length !== mod.edges.length) errors.push(`${mod.id}: undeclared graph objects`);
      if (!roots[0].querySelector("[data-interaction-controls]")) errors.push(`${mod.id}: missing accessible controls`);
    }
  }
  return errors;
}
