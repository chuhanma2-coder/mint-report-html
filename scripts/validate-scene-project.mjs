#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { validateSceneCss, validateSceneHtml } from "./scene-project.mjs";

const projectDir = path.resolve(process.argv[2] || "creative-output");
const outputFile = path.resolve(process.argv[3] || path.join(projectDir, "scene-project-qa.json"));
if (!fs.existsSync(path.join(projectDir, "creative-brief.json"))) { console.error("Usage: node validate-scene-project.mjs <project-dir> [report.json]"); process.exit(2); }
const brief = JSON.parse(fs.readFileSync(path.join(projectDir, "creative-brief.json"), "utf8"));
const map = JSON.parse(fs.readFileSync(path.join(projectDir, "content-map.json"), "utf8"));
const errors = [];
for (const scene of brief.scenes) {
  const htmlFile = path.join(projectDir, "src", "scenes", `${scene.id}.html`), cssFile = path.join(projectDir, "src", "scenes", `${scene.id}.css`);
  if (!fs.existsSync(htmlFile) || !fs.existsSync(cssFile)) { errors.push(`${scene.id}: 缺少 HTML 或 CSS Scene 模块`); continue; }
  errors.push(...validateSceneHtml(fs.readFileSync(htmlFile, "utf8"), scene, map.contentAtoms));
  errors.push(...validateSceneCss(fs.readFileSync(cssFile, "utf8"), scene.id));
}
const report = { schemaVersion: "0.9.3", passed: errors.length === 0, scenes: brief.scenes.length, errors };
fs.writeFileSync(outputFile, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
process.exit(report.passed ? 0 : 1);
