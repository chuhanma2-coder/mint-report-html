#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),".."),fixture=spawnSync(process.execPath,[path.join(root,"tests/v011-collaboration-contracts.mjs")],{encoding:"utf8",maxBuffer:20_000_000});assert.equal(fixture.status,0,fixture.stderr||fixture.stdout);const info=JSON.parse(fixture.stdout.trim().split("\n").at(-1)),folder=fs.mkdtempSync(path.join(os.tmpdir(),"mint-agent-pdf-")),pdf=path.join(folder,"report.pdf"),manifestFile=path.join(folder,"manifest.json"),result=spawnSync(process.execPath,[path.join(root,"scripts/export-creative-pdf.mjs"),info.productWork,pdf,manifestFile,"--kind=formal"],{encoding:"utf8",maxBuffer:20_000_000,env:process.env});assert.equal(result.status,0,result.stderr||result.stdout);const manifest=JSON.parse(fs.readFileSync(manifestFile,"utf8"));assert.equal(manifest.mode,"scene-capture-pipeline");assert.equal(manifest.sceneCaptureGate.passed,true);assert.equal(manifest.pdfArtifactGate.passed,true);assert.equal(manifest.pdfArtifactGate.renderedVerification.performed,true);assert.equal(manifest.pdfArtifactGate.renderedVerification.comparisons.length,1);assert.equal(manifest.pdfPageCount,1);assert.ok(fs.statSync(pdf).size>12000);console.log(JSON.stringify({passed:true,sceneCaptureGate:true,pdfArtifactGate:true,renderedVerification:true,pages:1,bytes:fs.statSync(pdf).size}));
