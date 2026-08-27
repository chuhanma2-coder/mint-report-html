#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateSceneCss, validateSceneHtml } from "./scene-project.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const skill = path.resolve(here, "..");
const projectDir = path.resolve(process.argv[2] || "creative-output");
const outputFile = path.resolve(process.argv[3] || path.join(projectDir, "report.html"));
const affected = new Set((process.argv.find((arg) => arg.startsWith("--scenes="))?.slice(9) || "").split(",").filter(Boolean));
if (!fs.existsSync(path.join(projectDir, "creative-brief.json"))) { console.error("Usage: node assemble-creative-report.mjs <project-dir> [report.html] [--scenes=MC-a,MC-b]"); process.exit(2); }
const read = (file) => fs.readFileSync(file, "utf8");
const brief = JSON.parse(read(path.join(projectDir, "creative-brief.json")));
const map = JSON.parse(read(path.join(projectDir, "content-map.json")));
const state = JSON.parse(read(path.join(projectDir, "project-state.json")));
const sceneById = Object.fromEntries(brief.scenes.map((scene) => [scene.id, scene]));
const errors = [], fragments = [], styles = [];
for (const sceneId of state.currentSceneOrder) {
  const scene = sceneById[sceneId];
  if (!scene) { errors.push(`${sceneId}: project-state 与 creative-brief 不一致`); continue; }
  const htmlFile = path.join(projectDir, "src", "scenes", `${sceneId}.html`), cssFile = path.join(projectDir, "src", "scenes", `${sceneId}.css`);
  if (!fs.existsSync(htmlFile) || !fs.existsSync(cssFile)) { errors.push(`${sceneId}: 缺少 Scene 模块`); continue; }
  const html = read(htmlFile), css = read(cssFile);
  errors.push(...validateSceneHtml(html, scene, map.contentAtoms), ...validateSceneCss(css, sceneId));
  fragments.push(html); styles.push(css);
}
if (errors.length) { console.error(JSON.stringify({ passed: false, errors }, null, 2)); process.exit(1); }
const tokens = read(path.join(skill, "assets", "mint-creative-tokens.css"));
const runtimeCss = read(path.join(skill, "assets", "mint-creative-runtime.css"));
const runtimeJs = read(path.join(skill, "assets", "mint-creative-runtime.js"));
const model = { schemaVersion: "0.9.3", sceneById, atoms: Object.fromEntries(map.contentAtoms.map((atom) => [atom.id, atom.text])), sourceSetHash: state.sourceSetHash, structureHash: state.structureHash };
const contentHash = crypto.createHash("sha256").update(JSON.stringify(model)).digest("hex");
const nav = state.currentSceneOrder.map((id) => `<button type="button" data-scene-target data-scene-id="${id}">${(sceneById[id].displayTitle || sceneById[id].sceneAnswer).slice(0, 18)}</button>`).join("");
const document = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="mint-content-hash" content="${contentHash}"><meta name="mint-pdf-state" content="stale"><title>Mint Report</title><style>${tokens}\n${runtimeCss}\n${styles.join("\n")}</style></head><body data-build-profile="${state.qaProfile}">${fragments.join("\n")}<nav class="mint-nav"><div class="mint-nav__items">${nav}</div><span class="mint-nav__progress"></span><button class="mint-control" data-export-pdf>下载 PDF</button></nav><button class="mint-page-arrow mint-page-arrow--prev mint-control" type="button" data-scene-prev aria-label="上一页">←</button><button class="mint-page-arrow mint-page-arrow--next mint-control" type="button" data-scene-next aria-label="下一页">→</button><button class="mint-edit-toggle mint-control" type="button" data-edit-toggle aria-label="编辑文字" aria-pressed="false"><span>✎</span><span data-edit-label>编辑 · E</span></button><span class="mint-edit-status">编辑中</span><div class="mint-modal" hidden><div class="mint-modal__content"></div><button data-modal-close>关闭</button></div><script type="application/json" id="mint-creative-data">${JSON.stringify(model).replaceAll("<", "\\u003c")}</script><script>${runtimeJs}</script></body></html>`;
fs.writeFileSync(outputFile, document);
const manifestFile = path.join(projectDir, "build-manifest.json");
const manifest = fs.existsSync(manifestFile) ? JSON.parse(read(manifestFile)) : {};
manifest.outputs = { ...(manifest.outputs || {}), html: { file: path.basename(outputFile), contentHash, status: "current" } };
manifest.affectedSceneIds = affected.size ? [...affected] : state.affectedSceneIds;
manifest.builtAt = new Date().toISOString();
fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ passed: true, scenes: fragments.length, affectedSceneIds: manifest.affectedSceneIds, outputFile, contentHash }, null, 2));
