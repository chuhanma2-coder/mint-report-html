#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const workflow = path.join(root, "scripts", "run-creative-workflow.mjs");
const stateScript = path.join(root, "core", "scripts", "project-state.mjs");
const testEnv = { ...process.env };
if (!testEnv.MINT_CHROMIUM_EXECUTABLE && fs.existsSync("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")) testEnv.MINT_CHROMIUM_EXECUTABLE = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "mint-v093-workflow-"));
const source = path.join(temp, "source.md"), project = path.join(temp, "project");
fs.writeFileSync(source, "# 经营进展\n周报系统已覆盖140个贷款页面。\n周报系统已把分析范围从利率扩展到成本费用。\n\n# 下一步\n项目团队首先进行小额测试。\n项目团队其次扩大样本范围。\n项目团队最后根据结果决定推广。\n");
const run = (args) => {
  const started = Date.now(); const result = spawnSync(process.execPath, args, { encoding: "utf8", maxBuffer: 40_000_000, env: testEnv });
  return { ...result, elapsedMs: Date.now() - started };
};
let result = run([workflow, "prepare", source, project]); assert.equal(result.status, 0, result.stderr || result.stdout);
for (const file of fs.readdirSync(path.join(project, "src", "scenes")).filter((name) => name.endsWith(".html"))) {
  const target = path.join(project, "src", "scenes", file); fs.writeFileSync(target, fs.readFileSync(target, "utf8").replace(' data-scene-status="placeholder"', ""));
}
const review = run([workflow, "review", project]); assert.equal(review.status, 0, review.stderr || review.stdout);
assert.ok(fs.existsSync(path.join(project, "report-preview.pdf")));
assert.equal(JSON.parse(fs.readFileSync(path.join(project, "project-state.json"), "utf8")).pdfState, "preview-current");
for (const action of ["soft-freeze", "freeze"]) { result = run([stateScript, path.join(project, "project-state.json"), action]); assert.equal(result.status, 0, result.stderr || result.stdout); }
const publish = run([workflow, "publish", project]); assert.equal(publish.status, 0, publish.stderr || publish.stdout);
assert.ok(fs.existsSync(path.join(project, "report.pdf")));
const publishedState = JSON.parse(fs.readFileSync(path.join(project, "project-state.json"), "utf8"));
assert.equal(publishedState.pdfState, "current");
assert.equal(publishedState.deliveryStatus, "formal-ready");
const delivery = JSON.parse(fs.readFileSync(path.join(project, "delivery-manifest.json"), "utf8"));
assert.equal(delivery.status, "formal-ready");
assert.ok(Object.values(delivery.checks).every(Boolean));
fs.writeFileSync(source, fs.readFileSync(source, "utf8").replace("140个", "141个"));
result = run([workflow, "prepare", source, project]); assert.equal(result.status, 0, result.stderr || result.stdout);
const revisedState = JSON.parse(fs.readFileSync(path.join(project, "project-state.json"), "utf8"));
assert.ok(revisedState.affectedSceneIds.length >= 1 && revisedState.affectedSceneIds.length < revisedState.currentSceneOrder.length);
const revision = run([workflow, "revision", project]); assert.equal(revision.status, 0, revision.stderr || revision.stdout);
assert.equal(JSON.parse(fs.readFileSync(path.join(project, "project-state.json"), "utf8")).deliveryStatus, "revision-ready");
assert.ok(revision.elapsedMs < publish.elapsedMs, `Revision ${revision.elapsedMs}ms 应短于 Publish ${publish.elapsedMs}ms`);
console.log(JSON.stringify({ passed: true, reviewMs: review.elapsedMs, revisionMs: revision.elapsedMs, publishMs: publish.elapsedMs, affectedScenes: revisedState.affectedSceneIds.length, totalScenes: revisedState.currentSceneOrder.length }, null, 2));
