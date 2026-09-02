#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateSceneCss, validateSceneHtml } from "./scene-project.mjs";
import { validateInteractions } from "./interaction-contract.mjs";
import { bindFields, escapeHtml } from "./field-bindings.mjs";
import { inlineAssets } from "./offline-assets.mjs";
import { sceneInput, implementationHash } from "./scene-inputs.mjs";
import { createReportModel } from "./report-model.mjs";

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
const model = { ...createReportModel(projectDir), sourceSetHash: state.sourceSetHash, structureHash: state.structureHash };
const sceneById = model.sceneById;
const candidate = process.argv.includes("--candidate");
const hasInteractions = brief.scenes.some(scene => scene.interactiveModules?.length);
const implHash = implementationHash(skill), cacheDir = path.join(projectDir, '.work/scene-cache');
fs.mkdirSync(cacheDir, { recursive: true });
const compiledSceneIds = [], reusedSceneIds = [];
const errors = [], fragments = [], styles = [];
for (const sceneId of state.currentSceneOrder) {
  const scene = sceneById[sceneId];
  if (!scene) { errors.push(`${sceneId}: project-state 与 creative-brief 不一致`); continue; }
  const htmlFile = path.join(projectDir, "src", "scenes", `${sceneId}.html`), cssFile = path.join(projectDir, "src", "scenes", `${sceneId}.css`);
  if (!fs.existsSync(htmlFile) || !fs.existsSync(cssFile)) { errors.push(`${sceneId}: 缺少 Scene 模块`); continue; }
  const input = sceneInput(projectDir, scene, model), cacheFile = path.join(cacheDir, sceneId + '.json');
  const cached = fs.existsSync(cacheFile) ? JSON.parse(read(cacheFile)) : null;
  if (cached?.inputHash === input.hash && cached.implHash === implHash) {
    fragments.push(cached.html); styles.push(cached.css); reusedSceneIds.push(sceneId); continue;
  }
  const binding = bindFields(input.html, model);
  const html = binding.html, css = input.css;
  const sceneErrors = [...binding.errors, ...validateInteractions(scene, model), ...validateSceneHtml(html, scene, map.contentAtoms), ...validateSceneCss(css, sceneId)];
  errors.push(...sceneErrors); compiledSceneIds.push(sceneId);
  if (!sceneErrors.length) fs.writeFileSync(cacheFile, JSON.stringify({ inputHash: input.hash, implHash, html, css }));
  fragments.push(html); styles.push(css);
}
if (errors.length) { console.error(JSON.stringify({ passed: false, errors }, null, 2)); process.exit(1); }
const tokens = read(path.join(skill, "assets", "mint-creative-tokens.css"));
const runtimeCss = read(path.join(skill, "assets", "mint-creative-runtime.css")) + (hasInteractions ? read(path.join(skill, "assets", "mint-interactions.css")) : "");
const runtimeJs = ["mint-fields.js", "mint-typed-editor.js", "mint-creative-runtime.js", ...(hasInteractions ? ["mint-interactions.js"] : []), "mint-export-state.js", "mint-package-export.js"].map(file => read(path.join(skill, "assets", file))).join("\n");
const contentHash = crypto.createHash("sha256").update(JSON.stringify(model)).digest("hex");
const nav = state.currentSceneOrder.map((id, index) => { const title=sceneById[id].displayTitle||sceneById[id].sceneAnswer||`第${index+1}页`;return `<button type="button" data-scene-target data-scene-id="${escapeHtml(id)}" aria-label="第${index+1}页：${escapeHtml(title)}" title="${escapeHtml(title)}"><span aria-hidden="true"></span></button>` }).join("");
const document = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="mint-content-hash" content="${contentHash}"><meta name="mint-pdf-state" content="stale"><title>Mint Report</title><style>${tokens}\n${runtimeCss}\n${styles.join("\n")}</style></head><body data-build-profile="${state.qaProfile}"><main class="mint-report-scenes">${fragments.join("\n")}</main><nav class="mint-nav"><div class="mint-nav__items">${nav}</div><button class="mint-control" data-save-workfile hidden>保存当前版</button><button class="mint-control" data-export-package hidden>导出技术包</button><button class="mint-control" data-export-pdf>下载 PDF</button><button class="mint-control mint-chrome-toggle" data-chrome-toggle aria-label="隐藏演示控件" aria-pressed="false">清屏 · H</button></nav><button class="mint-page-arrow mint-page-arrow--prev mint-control" type="button" data-scene-prev aria-label="上一页">←</button><button class="mint-page-arrow mint-page-arrow--next mint-control" type="button" data-scene-next aria-label="下一页">→</button><button class="mint-edit-toggle mint-control" type="button" data-edit-toggle aria-label="编辑内容" aria-pressed="false"><span>✎</span><span data-edit-label>编辑 · E</span></button><button class="mint-chrome-restore mint-control" type="button" data-chrome-restore aria-label="显示演示控件">显示控件 · H</button><span class="mint-edit-status">编辑中</span><div class="mint-modal" hidden><div class="mint-modal__content"></div><button data-modal-close data-ui-control>关闭</button></div><script type="application/json" id="mint-creative-data">${JSON.stringify(model).replaceAll("<", "\\u003c")}</script><script>${runtimeJs}</script></body></html>`;
const inlined = inlineAssets(document, projectDir);
fs.mkdirSync(path.dirname(outputFile), { recursive: true });
fs.writeFileSync(path.join(path.dirname(outputFile), "offline-asset-manifest.json"), `${JSON.stringify(inlined.manifest, null, 2)}\n`);
if (inlined.manifest.errors.length) { console.error(JSON.stringify(inlined.manifest, null, 2)); process.exit(1); }
fs.writeFileSync(outputFile, inlined.html);
fs.writeFileSync(path.join(path.dirname(outputFile), 'assembly-report.json'), JSON.stringify({ compiledSceneIds, reusedSceneIds, contentHash, implHash }, null, 2));
const manifestFile = path.join(projectDir, "build-manifest.json");
const manifest = fs.existsSync(manifestFile) ? JSON.parse(read(manifestFile)) : {};
manifest.outputs = { ...(manifest.outputs || {}), html: { file: path.basename(outputFile), contentHash, status: "current" } };
manifest.affectedSceneIds = affected.size ? [...affected] : state.affectedSceneIds;
manifest.builtAt = new Date().toISOString();
if (!candidate) fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ passed: true, scenes: fragments.length, affectedSceneIds: manifest.affectedSceneIds, outputFile, contentHash }, null, 2));
