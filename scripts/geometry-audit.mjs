export function geometryAuditInPage(sceneFilter = []) {
  const filters = new Set(sceneFilter || []);
  const visible = (node) => { const style = getComputedStyle(node); const box = node.getBoundingClientRect(); const hasArea = node.dataset.qaRole === "connector" ? box.width > 0 || box.height > 0 : box.width > 0 && box.height > 0; return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0 && hasArea; };
  const rect = (box) => ({ left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height });
  const qaRect = (node) => {
    const box = rect(node.getBoundingClientRect());
    if (node.dataset.qaRole !== "connector") return box;
    const stroke = Number.parseFloat(getComputedStyle(node).strokeWidth || node.getAttribute?.("stroke-width") || "0") || 0;
    const pad = Math.max(1, stroke / 2);
    return { left: box.left - pad, right: box.right + pad, top: box.top - pad, bottom: box.bottom + pad, width: box.width + pad * 2, height: box.height + pad * 2 };
  };
  const intersects = (a, b, pad = 0) => a.left < b.right - pad && a.right > b.left + pad && a.top < b.bottom - pad && a.bottom > b.top + pad;
  const contains = (outer, inner, pad = 1) => outer.left <= inner.left + pad && outer.right >= inner.right - pad && outer.top <= inner.top + pad && outer.bottom >= inner.bottom - pad;
  const glyphRects = (node) => {
    const result = [], walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const textNode = walker.currentNode;
      for (let index = 0; index < textNode.textContent.length; index += 1) {
        if (/\s/.test(textNode.textContent[index])) continue;
        const range = document.createRange(); range.setStart(textNode, index); range.setEnd(textNode, index + 1);
        for (const box of range.getClientRects()) if (box.width && box.height) result.push(rect(box));
      }
    }
    return result;
  };
  const connectorPoints = (node) => {
    if (typeof node.getTotalLength === "function" && typeof node.getPointAtLength === "function") {
      const length = node.getTotalLength(), matrix = node.getScreenCTM(), points = [];
      for (let distance = 0; distance <= length; distance += Math.max(2, length / 240)) {
        const local = node.getPointAtLength(distance);
        const point = new DOMPoint(local.x, local.y).matrixTransform(matrix);
        points.push({ x: point.x, y: point.y });
      }
      return points;
    }
    const box = node.getBoundingClientRect(), points = [];
    const horizontal = box.width >= box.height;
    const length = horizontal ? box.width : box.height;
    for (let offset = 0; offset <= length; offset += 2) points.push(horizontal ? { x: box.left + offset, y: box.top + box.height / 2 } : { x: box.left + box.width / 2, y: box.top + offset });
    return points;
  };
  const allowed = (left, right, leftBox, rightBox) => {
    const sameGroup = left.dataset.qaGroup && left.dataset.qaGroup === right.dataset.qaGroup;
    if (sameGroup && (left.dataset.qaOverlap === "allow-same-group" || right.dataset.qaOverlap === "allow-same-group")) return true;
    if (sameGroup && (left.dataset.qaOverlap === "allow-contained" || right.dataset.qaOverlap === "allow-contained") && (contains(leftBox, rightBox) || contains(rightBox, leftBox))) return true;
    return false;
  };
  const issues = [];
  for (const scene of document.querySelectorAll(".mint-scene")) {
    if (filters.size && !filters.has(scene.dataset.sceneId)) continue;
    const sceneBox = rect(scene.querySelector(".mint-scene__viewport")?.getBoundingClientRect() || scene.getBoundingClientRect());
    const elements = [...scene.querySelectorAll("[data-qa-role]")].filter(visible).map((node) => ({ node, role: node.dataset.qaRole, box: qaRect(node), glyphs: node.dataset.qaRole === "text" ? glyphRects(node) : [], points: node.dataset.qaRole === "connector" ? connectorPoints(node) : [] }));
    for (const item of elements) if (!contains(sceneBox, item.box, 2)) issues.push({ type: "element-outside-scene", sceneId: scene.dataset.sceneId, elementId: item.node.dataset.elementId || null, role: item.role, box: item.box });
    for (let i = 0; i < elements.length; i += 1) for (let j = i + 1; j < elements.length; j += 1) {
      const left = elements[i], right = elements[j];
      if (left.node.contains(right.node) || right.node.contains(left.node)) continue;
      if (!intersects(left.box, right.box, 1) || allowed(left.node, right.node, left.box, right.box)) continue;
      const text = left.role === "text" ? left : right.role === "text" ? right : null;
      const connector = left.role === "connector" ? left : right.role === "connector" ? right : null;
      if (text && connector) {
        const collision = connector.points.find((point) => text.glyphs.some((box) => point.x >= box.left - 1 && point.x <= box.right + 1 && point.y >= box.top - 1 && point.y <= box.bottom + 1));
        if (collision) issues.push({ type: "connector-text-collision", sceneId: scene.dataset.sceneId, textElementId: text.node.dataset.elementId || null, visualElementId: connector.node.dataset.elementId || null, point: collision, textBox: text.box, visualBox: connector.box });
        continue;
      }
      if (text || [left.role, right.role].some((role) => ["node", "media"].includes(role))) issues.push({ type: text ? "visual-text-collision" : "element-collision", sceneId: scene.dataset.sceneId, leftElementId: left.node.dataset.elementId || null, rightElementId: right.node.dataset.elementId || null, roles: [left.role, right.role], leftBox: left.box, rightBox: right.box, intersection: { width: Math.max(0, Math.min(left.box.right, right.box.right) - Math.max(left.box.left, right.box.left)), height: Math.max(0, Math.min(left.box.bottom, right.box.bottom) - Math.max(left.box.top, right.box.top)) } });
    }
    for (const text of elements.filter((item) => item.role === "text")) for (const glyph of text.glyphs) {
      const x = (glyph.left + glyph.right) / 2, y = (glyph.top + glyph.bottom) / 2;
      const overlay = document.elementsFromPoint(x, y).find((node) => node !== text.node && !text.node.contains(node) && !node.contains(text.node) && node.closest?.("[data-qa-role]"));
      if (!overlay) continue;
      const visual = overlay.closest("[data-qa-role]");
      if (visual?.dataset.qaRole !== "text" && !allowed(text.node, visual, text.box, rect(visual.getBoundingClientRect()))) issues.push({ type: "z-index-text-cover", sceneId: scene.dataset.sceneId, textElementId: text.node.dataset.elementId || null, visualElementId: visual.dataset.elementId || null, role: visual.dataset.qaRole });
    }
  }
  return issues;
}
