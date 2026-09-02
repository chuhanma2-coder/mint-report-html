#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),".."),temp=fs.mkdtempSync(path.join(os.tmpdir(),"mint-performance-v012-")),source=path.join(root,"tests/fixtures/forward-source.md");
const run=spawnSync(process.execPath,[path.join(root,"scripts/run-creative-workflow.mjs"),"prepare",source,temp],{encoding:"utf8",maxBuffer:30_000_000});assert.equal(run.status,0,run.stderr||run.stdout);
const capacity=JSON.parse(fs.readFileSync(path.join(temp,"capacity-report.json"),"utf8")),performance=JSON.parse(fs.readFileSync(path.join(temp,"performance-report.json"),"utf8")),routes=JSON.parse(fs.readFileSync(path.join(temp,"expression-routes.json"),"utf8"));
assert.equal(capacity.status,"within-reference-capacity");assert.ok(capacity.elapsedMs<20_000);assert.equal(performance.phase,"prepare");assert.ok(performance.steps.some(step=>step.script==="capacity-preflight.mjs"));assert.ok(performance.steps.some(step=>step.script==="prepare-creative.mjs"));assert.ok(Object.keys(routes.scenes).length>0);
const fields=fs.readFileSync(path.join(root,"assets/mint-fields.js"),"utf8"),pack=fs.readFileSync(path.join(root,"assets/mint-package-export.js"),"utf8");assert.match(fields,/setTimeout\([^,]+, 400\)/);assert.match(pack,/immutableFiles|manifest\.files/);assert.match(pack,/showSaveFilePicker/);assert.match(pack,/metaKey\|\|event\.ctrlKey/);
console.log(JSON.stringify({passed:true,preflightMs:capacity.elapsedMs,prepareMs:performance.elapsedMs,stageTiming:true,hashDebounced:true,routesSelected:Object.keys(routes.scenes).length}));
