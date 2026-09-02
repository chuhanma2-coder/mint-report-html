#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),".."),fixture=spawnSync(process.execPath,[path.join(root,"tests/v011-collaboration-contracts.mjs")],{encoding:"utf8",maxBuffer:30_000_000});assert.equal(fixture.status,0,fixture.stderr||fixture.stdout);const info=JSON.parse(fixture.stdout.trim().split("\n").at(-1));
const publish=spawnSync(process.execPath,[path.join(root,"scripts/run-creative-workflow.mjs"),"publish",info.merged],{encoding:"utf8",maxBuffer:60_000_000,env:process.env});assert.equal(publish.status,0,publish.stderr||publish.stdout);
for(const file of ["report.html","report.pdf","report.pptx","publish-snapshot.json","ppt-layout.json","pptx-manifest.json","delivery-manifest.json","performance-report.json"])assert.ok(fs.existsSync(path.join(info.merged,file)),`missing ${file}`);
const perf=JSON.parse(fs.readFileSync(path.join(info.merged,"performance-report.json"),"utf8")),ppt=JSON.parse(fs.readFileSync(path.join(info.merged,"pptx-manifest.json"),"utf8")),delivery=JSON.parse(fs.readFileSync(path.join(info.merged,"delivery-manifest.json"),"utf8"));
assert.equal(perf.steps.filter(step=>step.script==="visual-qa-creative.mjs").length,1);assert.equal(perf.steps.filter(step=>step.script==="export-creative-pdf.mjs").length,0);assert.equal(perf.steps.filter(step=>step.script==="extract-ppt-layout.mjs").length,1);assert.deepEqual(ppt.editableObjects,{text:4,chart:1,media:1,table:1,diagram:1});assert.equal(ppt.aspectRatio,"16:9");assert.equal(ppt.headers||ppt.footers||ppt.pageNumbers,false);assert.ok(Object.values(delivery.checks).every(Boolean));
console.log(JSON.stringify({passed:true,elapsedMs:perf.elapsedMs,singlePublishBrowserSession:true,snapshotReused:true,nativeEditable:ppt.editableObjects,pdfCurrent:delivery.checks.pdfCurrent}));
