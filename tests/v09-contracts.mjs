#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { classifyTask } from "../../mint-report-deck/scripts/classify-task.mjs";

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
assert.equal(brief.schemaVersion, "0.9");
assert.ok(brief.scenes.length >= 1);
assert.equal(ledger.entries.length, map.sourceUnits.length);
assert.equal(ledger.entries.filter((entry) => entry.disposition === "needs-confirmation").length, 0);
assert.deepEqual(new Set(brief.scenes.flatMap((scene) => scene.atomRefs)), new Set(map.contentAtoms.map((atom) => atom.id)));
assert.ok(brief.scenes.every((scene) => scene.managementQuestion && scene.sceneAnswer && scene.compositionIntent));
assert.ok(brief.scenes.at(-1).relationTypes.includes("sequence"), "先、再、最后必须识别为递进顺序");
assert.ok(brief.artDirection.motionLanguage.length <= 3);

const css = fs.readFileSync(path.join(root, "assets", "mint-creative-runtime.css"), "utf8");
const js = fs.readFileSync(path.join(root, "assets", "mint-creative-runtime.js"), "utf8");
const sceneHtml = brief.scenes.map((scene, index) => `<section class="mint-scene" data-scene-id="${scene.id}"><div data-reveal><span class="mint-scene__eyebrow">${index + 1}</span><h2 data-scene-answer data-field-path="scenes.${index}.sceneAnswer" data-edit-policy="editable">${scene.sceneAnswer}</h2>${scene.mustShow.map((ref) => `<p data-atom-ref="${ref}" data-field-path="atoms.${ref}" data-edit-policy="editable">${map.contentAtoms.find((atom) => atom.id === ref).text}</p>`).join("")}<div class="mint-details" hidden>${scene.expandableDetails.map((ref) => `<p data-atom-ref="${ref}" data-field-path="details.${ref}" data-edit-policy="editable">${map.contentAtoms.find((atom) => atom.id === ref).text}</p>`).join("")}</div></div></section>`).join("");
const buttons = brief.scenes.map((scene) => `<button data-scene-target>${scene.sceneAnswer.slice(0, 12)}</button>`).join("");
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="mint-pdf-state" content="stale"><style>${css}</style></head><body>${sceneHtml}<nav class="mint-nav"><div class="mint-nav__items">${buttons}</div><span class="mint-nav__progress"></span><button class="mint-control" data-export-pdf>下载 PDF</button></nav><span class="mint-edit-status">编辑中</span><div class="mint-modal" hidden><div class="mint-modal__content"></div><button data-modal-close>关闭</button></div><script type="application/json" id="mint-creative-data">${JSON.stringify({ scenes: brief.scenes, atoms: Object.fromEntries(map.contentAtoms.map((atom) => [atom.id, atom.text])) }).replaceAll("<", "\\u003c")}</script><script>${js}</script></body></html>`;
const htmlFile = path.join(temporary, "report.html");
fs.writeFileSync(htmlFile, html);
const qa = spawnSync(process.execPath, [path.join(root, "scripts", "qa-creative-html.mjs"), htmlFile, path.join(temporary, "creative-brief.json"), path.join(temporary, "qa-report.json")], { encoding: "utf8" });
assert.equal(qa.status, 0, qa.stderr || qa.stdout);
assert.equal(JSON.parse(fs.readFileSync(path.join(temporary, "qa-report.json"), "utf8")).passed, true);
console.log(JSON.stringify({ passed: true, tests: 14, scenes: brief.scenes.length, sourceUnits: map.sourceUnits.length }, null, 2));
