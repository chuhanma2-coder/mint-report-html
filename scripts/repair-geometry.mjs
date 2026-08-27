#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const project = path.resolve(process.argv[2] || "creative-output");
const reportFile = path.resolve(process.argv[3] || path.join(project, "visual-qa.json"));
if (!fs.existsSync(reportFile)) { console.error("Usage: repair-geometry.mjs <project-dir> [visual-qa.json]"); process.exit(2); }
const report = JSON.parse(fs.readFileSync(reportFile, "utf8"));
const repairFile = path.join(project, "geometry-repair.json");
if (fs.existsSync(repairFile)) { console.error("Automatic geometry repair already attempted for this revision"); process.exit(1); }
const shift = (moving, fixed) => {
  const left = fixed.left - moving.right - 12, right = fixed.right - moving.left + 12;
  const up = fixed.top - moving.bottom - 12, down = fixed.bottom - moving.top + 12;
  return Math.abs(up) <= Math.abs(down) && Math.abs(up) <= Math.abs(left) && Math.abs(up) <= Math.abs(right) ? [0, up]
    : Math.abs(down) <= Math.abs(left) && Math.abs(down) <= Math.abs(right) ? [0, down]
      : Math.abs(left) <= Math.abs(right) ? [left, 0] : [right, 0];
};
const changes = [];
for (const issue of report.issues || []) {
  if (issue.gate !== "geometry-collision" || !issue.sceneId) continue;
  let elementId = issue.visualElementId, moving = issue.visualBox, fixed = issue.textBox;
  if (issue.type === "element-collision") { elementId = issue.rightElementId; moving = issue.rightBox; fixed = issue.leftBox; }
  if (issue.type === "visual-text-collision") {
    const textIsLeft = issue.roles?.[0] === "text"; elementId = textIsLeft ? issue.rightElementId : issue.leftElementId; moving = textIsLeft ? issue.rightBox : issue.leftBox; fixed = textIsLeft ? issue.leftBox : issue.rightBox;
  }
  if (!elementId || !moving || !fixed) continue;
  const [x, y] = shift(moving, fixed);
  changes.push({ sceneId: issue.sceneId, elementId, x: Math.round(x), y: Math.round(y), reason: issue.type });
}
for (const change of changes) {
  const file = path.join(project, "src", "scenes", `${change.sceneId}.html`);
  if (!fs.existsSync(file)) continue;
  let html = fs.readFileSync(file, "utf8");
  const escaped = change.elementId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(<[^>]*data-element-id=["']${escaped}["'][^>]*)(>)`);
  html = html.replace(pattern, (match, start, end) => {
    const translate = `translate:${change.x}px ${change.y}px`;
    if (/\sstyle=["'][^"']*["']/.test(start)) return `${start.replace(/\sstyle=(["'])([^"']*)\1/, (_, quote, style) => ` style=${quote}${style};${translate}${quote}`)} data-geometry-repair="shift"${end}`;
    return `${start} style="${translate}" data-geometry-repair="shift"${end}`;
  });
  fs.writeFileSync(file, html);
}
fs.writeFileSync(repairFile, `${JSON.stringify({ schemaVersion: "0.9.3", attemptedAt: new Date().toISOString(), changes }, null, 2)}\n`);
console.log(JSON.stringify({ passed: changes.length > 0, changes }, null, 2));
process.exit(changes.length ? 0 : 1);
