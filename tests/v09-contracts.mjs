#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { classifyTask } from "../core/scripts/classify-task.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
assert.equal(classifyTask({ rawText: "帮我做一份 Mint 汇报" }).outputMode, "creative-html");
assert.deepEqual(classifyTask({ rawText: "帮我做一份 Mint 汇报" }).outputs, ["html", "pdf", "structure"]);
assert.equal(classifyTask({ rawText: "帮我做一份 Mint 汇报", outputs: ["pptx"] }).outputMode, "formal-multiformat");
assert.equal(classifyTask({ rawText: "监管资本方案", confirmed: true }).outputMode, "creative-html", "高风险不得自动切换视觉模式");
assert.equal(classifyTask({ rawText: "做成三页", requestedPages: 3 }).outputMode, "formal-multiformat");

const temporary = process.env.MINT_V09_KEEP_DIR
  ? path.resolve(process.env.MINT_V09_KEEP_DIR)
  : fs.mkdtempSync(path.join(os.tmpdir(), "mint-v09-"));
fs.mkdirSync(temporary, { recursive: true });
const source = path.join(here, "fixtures", "forward-source.md");
const prep = spawnSync(process.execPath, [path.join(root, "scripts", "prepare-creative.mjs"), source, temporary], { encoding: "utf8" });
assert.equal(prep.status, 0, prep.stderr || prep.stdout);
const brief = JSON.parse(fs.readFileSync(path.join(temporary, "creative-brief.json"), "utf8"));
const map = JSON.parse(fs.readFileSync(path.join(temporary, "content-map.json"), "utf8"));
const ledger = JSON.parse(fs.readFileSync(path.join(temporary, "source-ledger.json"), "utf8"));
assert.equal(brief.schemaVersion, "0.9.3");
assert.ok(brief.scenes.length >= 1);
assert.equal(ledger.entries.length, map.sourceUnits.length);
assert.equal(ledger.entries.filter((entry) => entry.disposition === "needs-confirmation").length, 0);
assert.deepEqual(new Set(brief.scenes.flatMap((scene) => scene.atomRefs)), new Set(map.contentAtoms.map((atom) => atom.id)));
assert.ok(brief.scenes.every((scene) => scene.managementQuestion && scene.sceneAnswer && scene.compositionIntent));
assert.ok(brief.scenes.every((scene) => scene.displayTitle && scene.titleContract.maxLines === 2 && scene.titleContract.letterSpacing === 0));
assert.equal(brief.artDirection.palette, "mint-scheme-c-original");
assert.equal(brief.artDirection.canvasMode, "dual-fixed-desktop-controlled-mobile");
assert.ok(brief.scenes.at(-1).relationTypes.includes("sequence"), "先、再、最后必须识别为递进顺序");
assert.ok(brief.artDirection.motionLanguage.length <= 3);

const css = fs.readFileSync(path.join(root, "assets", "mint-creative-runtime.css"), "utf8");
const tokenCss = fs.readFileSync(path.join(root, "assets", "mint-creative-tokens.css"), "utf8");
const js = fs.readFileSync(path.join(root, "assets", "mint-creative-runtime.js"), "utf8");
const sceneHtml = brief.scenes.map((scene, index) => `<section class="mint-scene" data-scene-id="${scene.id}"><div class="mint-scene__viewport"><div class="mint-scene__stage" data-reveal><span class="mint-scene__eyebrow" data-element-id="scene-index" data-content-id="system-page-index" data-field-path="scenes.${index}.index" data-edit-policy="locked" data-edit-reason="page-number" data-qa-role="text" data-qa-overlap="forbid">${index + 1}</span><h2 data-scene-answer data-title-contract data-title-role="${scene.titleContract.role}" data-element-id="scene-answer" data-content-id="${scene.mustShow[0]}" data-qa-role="text" data-qa-overlap="forbid" data-field-path="scenes.${index}.displayTitle" data-edit-policy="editable">${scene.displayTitle}</h2>${scene.displayTitle === scene.sceneAnswer ? "" : `<p class="mint-support" data-element-id="scene-support" data-content-id="${scene.mustShow[0]}" data-qa-role="text" data-qa-overlap="forbid" data-field-path="scenes.${index}.sceneAnswer" data-edit-policy="editable">${scene.sceneAnswer}</p>`}${scene.mustShow.map((ref) => `<p data-atom-ref="${ref}" data-element-id="atom-${ref}" data-content-id="${ref}" data-qa-role="text" data-qa-overlap="forbid" data-field-path="atoms.${ref}" data-edit-policy="editable">${map.contentAtoms.find((atom) => atom.id === ref).text}</p>`).join("")}</div></div><div class="mint-scene__details mint-details" hidden>${scene.expandableDetails.map((ref) => `<p data-atom-ref="${ref}" data-element-id="detail-${ref}" data-content-id="${ref}" data-qa-role="text" data-qa-overlap="forbid" data-field-path="details.${ref}" data-edit-policy="editable">${map.contentAtoms.find((atom) => atom.id === ref).text}</p>`).join("")}</div></section>`).join("");
const buttons = brief.scenes.map((scene) => `<button data-scene-target>${scene.sceneAnswer.slice(0, 12)}</button>`).join("");
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="mint-pdf-state" content="stale"><style>${tokenCss}${css}</style></head><body>${sceneHtml}<nav class="mint-nav"><div class="mint-nav__items">${buttons}</div><span class="mint-nav__progress"></span><button class="mint-control" data-export-pdf>下载 PDF</button><button class="mint-control" data-chrome-toggle>清屏 · H</button></nav><button class="mint-page-arrow mint-page-arrow--prev mint-control" data-scene-prev aria-label="上一页">←</button><button class="mint-page-arrow mint-page-arrow--next mint-control" data-scene-next aria-label="下一页">→</button><button class="mint-edit-toggle mint-control" data-edit-toggle aria-pressed="false"><span data-edit-label>编辑 · E</span></button><button class="mint-chrome-restore mint-control" data-chrome-restore>显示控件 · H</button><span class="mint-edit-status">编辑中</span><div class="mint-modal" hidden><div class="mint-modal__content"></div><button data-modal-close data-ui-control>关闭</button></div><script type="application/json" id="mint-creative-data">${JSON.stringify({ scenes: brief.scenes, atoms: Object.fromEntries(map.contentAtoms.map((atom) => [atom.id, atom.text])) }).replaceAll("<", "\\u003c")}</script><script>${js}</script></body></html>`;
const htmlFile = path.join(temporary, "report.html");
fs.writeFileSync(htmlFile, html);
const qa = spawnSync(process.execPath, [path.join(root, "scripts", "qa-creative-html.mjs"), htmlFile, path.join(temporary, "creative-brief.json"), path.join(temporary, "qa-report.json")], { encoding: "utf8" });
assert.equal(qa.status, 0, qa.stderr || qa.stdout);
assert.equal(JSON.parse(fs.readFileSync(path.join(temporary, "qa-report.json"), "utf8")).passed, true);
assert.match(js, /ArrowRight/);
assert.match(js, /data-edit-toggle/);
console.log(JSON.stringify({ passed: true, tests: 20, scenes: brief.scenes.length, sourceUnits: map.sourceUnits.length }, null, 2));
