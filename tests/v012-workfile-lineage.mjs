#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), sha = value => crypto.createHash("sha256").update(value).digest("hex");
const fixture = spawnSync(process.execPath, [path.join(root, "tests/v011-collaboration-contracts.mjs")], { encoding: "utf8", maxBuffer: 30_000_000 }); assert.equal(fixture.status, 0, fixture.stderr || fixture.stdout);
const info = JSON.parse(fixture.stdout.trim().split("\n").at(-1)), temp = fs.mkdtempSync(path.join(os.tmpdir(), "mint-lineage-"));
function payload(html) { const match = html.match(/<script\b[^>]*id=["']mint-package-data["'][^>]*>([\s\S]*?)<\/script>/i); assert.ok(match); return { match, value: JSON.parse(match[1]) }; }
function revise(input, output, title, ancestors = null) {
  const html = fs.readFileSync(input, "utf8"), parsed = payload(html), entries = new Map(parsed.value.entries.map(entry => [entry.name, entry.base64]));
  const model = JSON.parse(Buffer.from(entries.get("report-model.json"), "base64").toString("utf8")), manifest = JSON.parse(Buffer.from(entries.get("mint-package.json"), "base64").toString("utf8"));
  model.sceneById[Object.keys(model.sceneById)[0]].displayTitle = title; model.updatedAt = new Date().toISOString(); const modelBytes = Buffer.from(`${JSON.stringify(model, null, 2)}\n`), nextHash = sha(modelBytes), previous = manifest.contentHash;
  manifest.lineage = ancestors || [...new Set([...(manifest.lineage || []), previous])]; manifest.parentContentHash = previous; manifest.contentHash = nextHash; manifest.revision += 1; manifest.files["report-model.json"] = nextHash; manifest.updatedAt = model.updatedAt;
  entries.set("report-model.json", modelBytes.toString("base64")); entries.set("mint-package.json", Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`).toString("base64")); parsed.value.entries = [...entries].map(([name, base64]) => ({ name, base64 })); fs.writeFileSync(output, html.replace(parsed.match[1], JSON.stringify(parsed.value))); return manifest;
}
const branchA = path.join(temp, "branch-a.html"), branchB = path.join(temp, "branch-b.html"), desc = path.join(temp, "descendant-renamed.html");
const a = revise(info.productWork, branchA, "分支 A"), b = revise(info.productWork, branchB, "分支 B");
const d = revise(branchA, desc, "分支 A 后代", [...a.lineage, a.contentHash]);
const duplicateMerge = spawnSync(process.execPath, [path.join(root, "scripts/collaboration-package.mjs"), "merge", info.brief, path.join(temp, "dedupe"), info.productWork, info.productWork, info.financeWork], { encoding: "utf8", maxBuffer: 30_000_000 }); assert.equal(duplicateMerge.status, 0, duplicateMerge.stderr || duplicateMerge.stdout);
const descendantMerge = spawnSync(process.execPath, [path.join(root, "scripts/collaboration-package.mjs"), "merge", info.brief, path.join(temp, "descendant"), info.productWork, branchA, desc, info.financeWork], { encoding: "utf8", maxBuffer: 30_000_000 }); assert.equal(descendantMerge.status, 0, descendantMerge.stderr || descendantMerge.stdout); const mergedModel = JSON.parse(fs.readFileSync(path.join(temp, "descendant", "report-model.json"), "utf8")); assert.equal(mergedModel.sceneById["section-product__MC-one"].displayTitle, "分支 A 后代");
const conflict = spawnSync(process.execPath, [path.join(root, "scripts/collaboration-package.mjs"), "merge", info.brief, path.join(temp, "conflict"), branchA, branchB, info.financeWork], { encoding: "utf8", maxBuffer: 30_000_000 }); assert.notEqual(conflict.status, 0); assert.match(conflict.stderr, /Conflicting revisions/);
assert.notEqual(a.contentHash, b.contentHash); assert.ok(d.lineage.includes(a.contentHash));
console.log(JSON.stringify({ passed: true, renamed: true, duplicateDeduped: true, strictDescendantSelected: true, divergentBlocked: true }));
