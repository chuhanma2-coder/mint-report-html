#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const command = process.argv[2];
const run = (script, args, label) => {
  const result = spawnSync(process.execPath, [path.join(here, script), ...args], { encoding: "utf8", stdio: "pipe", maxBuffer: 40_000_000, env: process.env });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.status !== 0) { if (result.stderr) process.stderr.write(result.stderr); throw new Error(`${label} failed`); }
};
const attempt = (script, args) => spawnSync(process.execPath, [path.join(here, script), ...args], { encoding: "utf8", stdio: "pipe", maxBuffer: 40_000_000, env: process.env });

if (command === "prepare") {
  const source = path.resolve(process.argv[3] || ""), project = path.resolve(process.argv[4] || "creative-output"), options = process.argv[5] ? path.resolve(process.argv[5]) : null;
  if (!source || !fs.existsSync(source)) { console.error("Usage: run-creative-workflow.mjs prepare <source> <project-dir> [options.json]"); process.exit(2); }
  run("prepare-creative.mjs", [source, project, ...(options ? [options] : [])], "prepare");
  console.log(JSON.stringify({ passed: true, phase: "prepare", next: "author Scene modules, remove data-scene-status=placeholder, then run review" }, null, 2));
  process.exit(0);
}

const project = path.resolve(process.argv[3] || "creative-output");
if (!fs.existsSync(path.join(project, "project-state.json"))) { console.error("Project has no project-state.json. Run prepare first."); process.exit(2); }
const state = JSON.parse(fs.readFileSync(path.join(project, "project-state.json"), "utf8"));
const report = path.join(project, "report.html"), qa = path.join(project, "qa-report.json"), visual = path.join(project, "visual-qa.json");
const affected = state.affectedSceneIds || [];
const shaFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const profile = command === "publish" ? "publish" : command === "revision" ? "revision" : "review";
if (profile === "publish" && state.structureState !== "frozen") { console.error("Publish blocked: structureState must be frozen"); process.exit(1); }
if ((state.openIssues || []).length) { console.error(`Workflow blocked: resolve project-state.openIssues first (${state.openIssues.join("；")})`); process.exit(1); }
try {
  run("validate-scene-project.mjs", [project], "scene-contract");
  run("assemble-creative-report.mjs", [project, report, ...(profile === "revision" && affected.length ? [`--scenes=${affected.join(",")}`] : [])], "assemble");
  run("qa-creative-html.mjs", [report, path.join(project, "creative-brief.json"), qa], "static-qa");
  const visualArgs = [report, visual, path.join(project, "visual-qa"), `--profile=${profile}`, ...(profile === "revision" && affected.length ? [`--scenes=${affected.join(",")}`] : [])];
  let visualResult = attempt("visual-qa-creative.mjs", visualArgs);
  if (visualResult.stdout) process.stdout.write(visualResult.stdout);
  if (visualResult.status !== 0) {
    const visualReport = fs.existsSync(visual) ? JSON.parse(fs.readFileSync(visual, "utf8")) : null;
    const collisionOnly = visualReport?.issues?.length && visualReport.issues.every((issue) => issue.gate === "geometry-collision");
    if (!collisionOnly) throw new Error("browser-qa failed");
    const repairResult = attempt("repair-geometry.mjs", [project, visual]);
    if (repairResult.stdout) process.stdout.write(repairResult.stdout);
    if (repairResult.status !== 0) throw new Error("automatic geometry repair failed");
    run("assemble-creative-report.mjs", [project, report, ...(profile === "revision" && affected.length ? [`--scenes=${affected.join(",")}`] : [])], "reassemble-after-repair");
    visualResult = attempt("visual-qa-creative.mjs", visualArgs);
    if (visualResult.stdout) process.stdout.write(visualResult.stdout);
    if (visualResult.status !== 0) throw new Error("needs-layout-review: geometry still fails after one repair");
  }
  if (profile === "publish" || process.argv.includes("--preview-pdf")) {
    const pdf = path.join(project, profile === "publish" ? "report.pdf" : "report-preview.pdf");
    const manifest = path.join(project, profile === "publish" ? "export-manifest.json" : "preview-export-manifest.json");
    run("export-creative-pdf.mjs", [report, pdf, manifest, `--kind=${profile === "publish" ? "formal" : "preview"}`], "pdf-export");
    const stateFile = path.join(project, "project-state.json");
    const current = JSON.parse(fs.readFileSync(stateFile, "utf8"));
    current.pdfState = profile === "publish" ? "current" : "preview-current";
    current.deliveryStatus = profile === "publish" ? "formal-ready" : "preview-ready";
    current.qaProfile = profile;
    current.affectedSceneIds = [];
    current.lastCompletedAction = `${profile}-pdf-generated`;
    current.pendingActions = profile === "publish" ? [] : ["review-preview-and-freeze-structure-before-publish"];
    current.updatedAt = new Date().toISOString();
    fs.writeFileSync(stateFile, `${JSON.stringify(current, null, 2)}\n`);
    const buildFile = path.join(project, "build-manifest.json");
    const build = fs.existsSync(buildFile) ? JSON.parse(fs.readFileSync(buildFile, "utf8")) : { schemaVersion: "0.9.4", outputs: {} };
    build.outputs = { ...build.outputs, html: { file: "report.html", hash: shaFile(report), state: "current" }, ...(profile === "publish" ? { formalPdf: { file: "report.pdf", hash: shaFile(pdf), state: "current" } } : { previewPdf: { file: "report-preview.pdf", hash: shaFile(pdf), state: "current" } }) };
    build.generatedAt = new Date().toISOString();
    fs.writeFileSync(buildFile, `${JSON.stringify(build, null, 2)}\n`);
    if (profile === "publish") {
      const exportManifest = JSON.parse(fs.readFileSync(manifest, "utf8"));
      const visualReport = JSON.parse(fs.readFileSync(visual, "utf8"));
      const staticReport = JSON.parse(fs.readFileSync(qa, "utf8"));
      const delivery = {
        schemaVersion: "0.9.4",
        status: "formal-ready",
        structureState: current.structureState,
        qaProfile: "publish",
        sourceSetHash: current.sourceSetHash,
        structureHash: current.structureHash,
        sceneOrder: current.currentSceneOrder,
        checks: { staticQa: staticReport.passed === true, browserQa: visualReport.passed === true, pdfCurrent: exportManifest.status === "matched" && exportManifest.kind === "formal" },
        outputs: { html: build.outputs.html, pdf: build.outputs.formalPdf, pdfContentHash: exportManifest.contentHash },
        generatedAt: new Date().toISOString()
      };
      if (!Object.values(delivery.checks).every(Boolean)) throw new Error("formal-ready blocked: delivery checks are incomplete");
      fs.writeFileSync(path.join(project, "delivery-manifest.json"), `${JSON.stringify(delivery, null, 2)}\n`);
    }
  } else {
    const stateFile = path.join(project, "project-state.json");
    const current = JSON.parse(fs.readFileSync(stateFile, "utf8"));
    current.deliveryStatus = profile === "review" ? "review-ready" : "revision-ready";
    current.qaProfile = profile;
    current.lastCompletedAction = `${profile}-validated`;
    current.updatedAt = new Date().toISOString();
    fs.writeFileSync(stateFile, `${JSON.stringify(current, null, 2)}\n`);
  }
  console.log(JSON.stringify({ passed: true, phase: profile, checkedScenes: profile === "revision" ? affected : "all", report }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ passed: false, phase: profile, error: error.message }, null, 2));
  process.exit(1);
}
