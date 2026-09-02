#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createProjectState, sessionBrief } from "../core/scripts/project-state.mjs";
import { writeReportModel } from "./report-model.mjs";
import { createZip, readZip } from "./mint-zip.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_VERSION = "0.12.0", WORKFILE_VERSION = "0.12";
const readJson = file => JSON.parse(fs.readFileSync(file, "utf8"));
const parseJson = (files, name) => { if (!files.has(name)) throw new Error(`Package is missing ${name}`); return JSON.parse(files.get(name).toString("utf8")); };
const sha = value => crypto.createHash("sha256").update(value).digest("hex");
const safeId = value => String(value || "").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); };
const DESIGN_CONTRACT = Object.freeze({ tokenVersion: "mint-scheme-c-original/1", artDirectionSeed: "report-id", stage: "1920x1080", aspectRatio: "16:9", pageChrome: "none" });

function validateBrief(input) {
  const sections = [...(input.sections || [])].map((section, index) => {
    const outlineItems = [...(section.outlineItems || [])].map(String);
    const id = safeId(section.sectionId || section.id || `section-${index + 1}`);
    const title = String(section.title || (outlineItems.length ? `大纲第${outlineItems.join("、")}项` : "")).trim();
    return { id, sectionId: id, title, order: Number(section.order || index + 1), outlineItems, ...(section.owner ? { owner: String(section.owner) } : {}) };
  }).sort((a, b) => a.order - b.order);
  if (!safeId(input.reportId) || !String(input.title || "").trim() || !sections.length || sections.some(section => !section.id || !section.title)) throw new Error("Task card requires reportId, title, and non-empty sections");
  if (new Set(sections.map(section => section.id)).size !== sections.length || new Set(sections.map(section => section.order)).size !== sections.length) throw new Error("Task card section ids and order values must be unique");
  const reportId = safeId(input.reportId), outlineOrder = [...(input.outlineOrder || sections.flatMap(section => section.outlineItems))].map(String);
  return {
    schemaVersion: SCHEMA_VERSION, kind: "mint-task-card", skillContractVersion: "mint-report-html/0.12", reportId,
    title: String(input.title).trim(), purpose: String(input.purpose || "管理汇报").trim(), outlineOrder, sections,
    warnings: [...(input.warnings || [])].map(String),
    designContract: { ...DESIGN_CONTRACT, artDirectionSeed: reportId },
    artDirection: { palette: "mint-scheme-c-original", visualMood: "简洁、清新、专业，页面构图随管理问题变化", motionLanguage: ["scene-reveal", "semantic-progress", "focus-shift"] },
    publish: { aspectRatio: "16:9", headers: false, footers: false, pageNumbers: false, formats: ["html", "pptx", "pdf"] }
  };
}

function projectFiles(projectDir) {
  const fixed = ["task-card.json", "report-brief.json", "source-lock.json", "content-map.json", "creative-brief.json", "source-ledger.json", "management-clusters.json", "expression-routes.json", "capacity-report.json", "project-state.json", "build-manifest.json", "asset-manifest.json", "offline-asset-manifest.json", "report-model.json"];
  const names = fixed.filter(name => fs.existsSync(path.join(projectDir, name)));
  for (const root of ["src/scenes", "assets"]) {
    const folder = path.join(projectDir, root); if (!fs.existsSync(folder)) continue;
    const walk = current => { for (const entry of fs.readdirSync(current, { withFileTypes: true })) { const file = path.join(current, entry.name); if (entry.isDirectory()) walk(file); else names.push(path.relative(projectDir, file).replaceAll(path.sep, "/")); } };
    walk(folder);
  }
  return [...new Set(names)].sort();
}

function packageEntries(projectDir, manifest) {
  writeReportModel(projectDir);
  const entries = projectFiles(projectDir).map(name => ({ name, data: fs.readFileSync(path.join(projectDir, name)) }));
  const files = Object.fromEntries(entries.map(entry => [entry.name, sha(entry.data)]));
  const model = entries.find(entry => entry.name === "report-model.json")?.data || Buffer.from("{}");
  const packageManifest = { schemaVersion: SCHEMA_VERSION, workfileVersion: WORKFILE_VERSION, revision: 1, parentContentHash: null, lineage: [], contentHash: sha(model), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ...manifest, immutableFiles: Object.keys(files).filter(name => name !== "report-model.json"), files };
  return [{ name: "mint-package.json", data: Buffer.from(`${JSON.stringify(packageManifest, null, 2)}\n`) }, ...entries];
}

function injectPackage(reportHtml, entries, downloadName, packageDownloadName) {
  const manifest = JSON.parse(entries.find(entry => entry.name === "mint-package.json").data.toString("utf8"));
  const payload = { schemaVersion: SCHEMA_VERSION, workfileVersion: WORKFILE_VERSION, kind: manifest.kind, downloadName, packageDownloadName, entries: entries.map(entry => ({ name: entry.name, base64: entry.data.toString("base64") })) };
  const tag = `<script type="application/json" id="mint-package-data">${JSON.stringify(payload).replaceAll("<", "\\u003c")}</script>`;
  return reportHtml.replace('<script type="application/json" id="mint-creative-data">', `${tag}<script type="application/json" id="mint-creative-data">`);
}

function writePackageOutput(kind, projectDir, briefFile, sectionId, outputFile, companionFile) {
  const brief = validateBrief(readJson(briefFile));
  const section = kind === "mint-section" ? brief.sections.find(item => item.id === sectionId) : null;
  if (kind === "mint-section" && !section) throw new Error(`Unknown section ${sectionId}`);
  if (!fs.existsSync(path.join(projectDir, "report.html"))) throw new Error("Review HTML is required before packaging");
  const manifest = { kind, reportId: brief.reportId, reportTitle: brief.title, designContract: brief.designContract, ...(section ? { sectionId: section.id, sectionTitle: section.title, sectionOrder: section.order, owner: section.owner || "", outlineItems: section.outlineItems } : { sectionIds: brief.sections.map(item => item.id) }), brief };
  const entries = packageEntries(projectDir, manifest), isZip = /\.zip$/i.test(outputFile);
  const packageDownloadName = `${section?.id || brief.reportId}.${kind}.zip`.replace(".mint-section.mint-section", ".mint-section").replace(".mint-report.mint-report", ".mint-report");
  const workFile = isZip ? (companionFile || outputFile.replace(/\.zip$/i, "-preview.mint-section.html")) : outputFile;
  const html = injectPackage(fs.readFileSync(path.join(projectDir, "report.html"), "utf8"), entries, path.basename(workFile), path.basename(isZip ? outputFile : packageDownloadName));
  fs.writeFileSync(workFile, html);
  let technicalZip = null; if (isZip) { fs.writeFileSync(outputFile, createZip(entries)); technicalZip = outputFile; }
  return { workFile, technicalZip, entries: entries.length, bytes: fs.statSync(workFile).size };
}

function extractPackagePayload(html, label) {
  const match = html.match(/<script\b[^>]*id=["']mint-package-data["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!match) throw new Error(`Workfile ${label} does not contain an embedded Mint package`);
  const payload = JSON.parse(match[1]); if (!Array.isArray(payload.entries)) throw new Error(`Workfile ${label} has invalid package data`);
  return new Map(payload.entries.map(entry => [entry.name, Buffer.from(entry.base64, "base64")]));
}

function readPackageFile(file) {
  const bytes = fs.readFileSync(file);
  if (bytes.length >= 4 && bytes.readUInt32LE(0) === 0x04034b50) return readZip(bytes);
  return extractPackagePayload(bytes.toString("utf8"), path.basename(file));
}

function normalizedManifest(entries) {
  const manifest = parseJson(entries, "mint-package.json"), modelHash = sha(entries.get("report-model.json") || Buffer.from("{}"));
  return { ...manifest, revision: Number(manifest.revision || 1), lineage: [...(manifest.lineage || [])], parentContentHash: manifest.parentContentHash || null, contentHash: manifest.contentHash || modelHash };
}

function verifyPackage(entries, manifest, label) {
  for (const [name, expected] of Object.entries(manifest.files || {})) {
    if (!entries.has(name)) throw new Error(`Package ${label} is missing declared file ${name}`);
    if (sha(entries.get(name)) !== expected) throw new Error(`Package ${label} failed integrity check for ${name}`);
  }
  if (sha(entries.get("report-model.json") || Buffer.from("{}")) !== manifest.contentHash) throw new Error(`Package ${label} content hash does not match report-model.json`);
}

function resolveSectionPackages(brief, packages) {
  const resolved = [];
  for (const section of brief.sections) {
    const candidates = packages.filter(pkg => pkg.manifest.sectionId === section.id); if (!candidates.length) throw new Error(`Missing sections: ${section.id}`);
    const unique = [...new Map(candidates.map(pkg => [pkg.manifest.contentHash, pkg])).values()];
    if (unique.length === 1) { resolved.push(unique[0]); continue; }
    const descendants = unique.filter(candidate => unique.every(other => other === candidate || candidate.manifest.lineage.includes(other.manifest.contentHash)));
    if (descendants.length !== 1) throw new Error(`Conflicting revisions for section ${section.id}; choose one current workfile before merge`);
    resolved.push(descendants[0]);
  }
  return resolved;
}

function collectIds(value, ids = new Set()) { if (Array.isArray(value)) for (const item of value) collectIds(item, ids); else if (value && typeof value === "object") for (const [key, item] of Object.entries(value)) { if (key === "id" && typeof item === "string") ids.add(item); collectIds(item, ids); } return ids; }
function replaceString(value, mapping) {
  if (mapping.has(value)) return mapping.get(value); let result = value;
  for (const [before, after] of [...mapping.entries()].sort((a, b) => b[0].length - a[0].length)) {
    result = result.replaceAll(`DU:${before}`, `DU:${after}`).replaceAll(`atoms.${before}`, `atoms.${after}`).replaceAll(`sceneById.${before}`, `sceneById.${after}`);
    const escaped = before.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); result = result.replace(new RegExp(`(?<![A-Za-z0-9_-])${escaped}(?![A-Za-z0-9_-])`, "g"), after);
  }
  return result;
}
function remap(value, mapping) { if (typeof value === "string") return replaceString(value, mapping); if (Array.isArray(value)) return value.map(item => remap(item, mapping)); if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [mapping.get(key) || key, remap(item, mapping)])); return value; }
function uniqueById(items) { const seen = new Set(); return items.filter(item => { if (!item?.id || seen.has(item.id)) return false; seen.add(item.id); return true; }); }

function mergePackages(briefFile, outputDir, inputFiles) {
  const brief = validateBrief(readJson(briefFile));
  const packages = inputFiles.map(file => { const entries = readPackageFile(file), manifest = normalizedManifest(entries); verifyPackage(entries, manifest, path.basename(file)); return { file, entries, manifest }; });
  for (const pkg of packages) {
    const manifest = pkg.manifest;
    if (manifest.kind !== "mint-section" || manifest.reportId !== brief.reportId) throw new Error(`Package ${manifest.sectionId || "unknown"} does not belong to ${brief.reportId}`);
    if (manifest.designContract && JSON.stringify(manifest.designContract) !== JSON.stringify(brief.designContract)) throw new Error(`Package ${manifest.sectionId} uses a different design contract`);
  }
  const selected = resolveSectionPackages(brief, packages); fs.mkdirSync(path.join(outputDir, "src", "scenes"), { recursive: true });
  const mergedBriefs = [], maps = [], ledgers = [], locks = [], models = [], orders = [];
  for (const section of brief.sections) {
    const pkg = selected.find(item => item.manifest.sectionId === section.id), entries = pkg.entries;
    const creative = parseJson(entries, "creative-brief.json"), map = parseJson(entries, "content-map.json"), ledger = parseJson(entries, "source-ledger.json"), lock = parseJson(entries, "source-lock.json"), model = parseJson(entries, "report-model.json");
    const ids = new Set([...collectIds(creative), ...collectIds(map), ...collectIds(ledger)]), prefix = `section-${safeId(section.id)}__`, mapping = new Map([...ids].map(id => [id, `${prefix}${id}`]));
    for (const sceneId of Object.keys(model.sceneById || {})) if (!mapping.has(sceneId)) mapping.set(sceneId, `${prefix}${sceneId}`);
    for (const atomId of Object.keys(model.atoms || {})) if (!mapping.has(atomId)) mapping.set(atomId, `${prefix}${atomId}`);
    for (const group of ["tables", "charts", "media", "diagrams"]) for (const fieldId of Object.keys(model[group] || {})) if (!mapping.has(fieldId)) mapping.set(fieldId, `${prefix}${fieldId}`);
    const assetMapping = new Map();
    for (const [name, bytes] of entries) {
      if (!name.startsWith("assets/")) continue; const next = `assets/${safeId(section.id)}/${name.slice("assets/".length)}`;
      assetMapping.set(name, next); assetMapping.set(`./${name}`, `./${next}`); const destination = path.join(outputDir, next); fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.writeFileSync(destination, bytes);
    }
    const combinedMapping = new Map([...mapping, ...assetMapping]);
    const changedCreative = remap(creative, combinedMapping), changedMap = remap(map, combinedMapping), changedLedger = remap(ledger, combinedMapping), changedLock = remap(lock, combinedMapping), changedModel = remap(model, combinedMapping);
    changedCreative.scenes = changedCreative.scenes.map(scene => ({ ...scene, sectionId: section.id, sectionTitle: section.title }));
    mergedBriefs.push(changedCreative); maps.push(changedMap); ledgers.push(changedLedger); locks.push(changedLock); models.push(changedModel); orders.push(...changedCreative.scenes.map(scene => scene.id));
    for (const [name, bytes] of entries) {
      if (!name.startsWith("src/scenes/")) continue; const extension = path.extname(name), oldId = path.basename(name, extension), newId = mapping.get(oldId) || `${prefix}${oldId}`;
      fs.writeFileSync(path.join(outputDir, "src", "scenes", `${newId}${extension}`), replaceString(bytes.toString("utf8"), combinedMapping));
    }
  }
  const firstMap = maps[0], contentMap = { ...firstMap, schemaVersion: "0.11.0", sourceUnits: maps.flatMap(item => item.sourceUnits || []), discourseUnits: maps.flatMap(item => item.discourseUnits || []), numericClaims: maps.flatMap(item => item.numericClaims || []), contentAtoms: maps.flatMap(item => item.contentAtoms || []), entities: uniqueById(maps.flatMap(item => item.entities || [])), relationships: uniqueById(maps.flatMap(item => item.relationships || [])), semanticGraph: { nodes: maps.flatMap(item => item.semanticGraph?.nodes || []), edges: maps.flatMap(item => item.semanticGraph?.edges || []) } };
  const creativeBrief = { ...mergedBriefs[0], schemaVersion: "0.11.0", status: "planned", narrativeSpine: mergedBriefs.flatMap(item => item.narrativeSpine || []), scenes: mergedBriefs.flatMap(item => item.scenes || []), artDirection: { ...mergedBriefs[0].artDirection, visualMood: brief.artDirection.visualMood, motionLanguage: brief.artDirection.motionLanguage, palette: brief.artDirection.palette, designContract: brief.designContract }, blockingIssues: [] };
  const sourceLock = { schemaVersion: "0.11.0", sourceId: brief.reportId, unitCount: locks.reduce((sum, item) => sum + Number(item.unitCount || 0), 0), unitIds: locks.flatMap(item => item.unitIds || []), unitDigests: Object.assign({}, ...locks.map(item => item.unitDigests || {})), immutable: true };
  const sourceLedger = { schemaVersion: "0.11.0", sourceLockRef: "source-lock.json", contentMapRef: "content-map.json", creativeBriefRef: "creative-brief.json", entries: ledgers.flatMap(item => item.entries || []).map(entry => ({ ...entry, placements: { ...(entry.placements || {}), pptx: "planned-native" } })) };
  const reportModel = { schemaVersion: "0.11.0", reportId: brief.reportId, reportTitle: brief.title, sceneById: Object.assign({}, ...models.map(item => item.sceneById || {})), atoms: Object.assign({}, ...models.map(item => item.atoms || {})), tables: Object.assign({}, ...models.map(item => item.tables || {})), charts: Object.assign({}, ...models.map(item => item.charts || {})), media: Object.assign({}, ...models.map(item => item.media || {})), diagrams: Object.assign({}, ...models.map(item => item.diagrams || {})), userEdits: models.flatMap(item => item.userEdits || []) };
  const state = createProjectState({ sourceSetHash: sha(JSON.stringify(sourceLock.unitDigests)), sceneOrder: orders, clusters: creativeBrief.scenes.map(scene => ({ clusterId: scene.id, managementQuestion: scene.managementQuestion, sourceUnitRefs: scene.sourceUnitRefs })), artDirectionHash: sha(JSON.stringify(brief.designContract)), requestedProfile: "review", structuralChange: true, contentChange: true, affectedSceneIds: orders, openIssues: [] }); state.structureState = "frozen";
  writeJson(path.join(outputDir, "task-card.json"), brief); writeJson(path.join(outputDir, "report-brief.json"), brief); writeJson(path.join(outputDir, "source-lock.json"), sourceLock); writeJson(path.join(outputDir, "content-map.json"), contentMap); writeJson(path.join(outputDir, "creative-brief.json"), creativeBrief); writeJson(path.join(outputDir, "source-ledger.json"), sourceLedger); writeJson(path.join(outputDir, "report-model.json"), reportModel); writeJson(path.join(outputDir, "project-state.json"), state);
  writeJson(path.join(outputDir, "management-clusters.json"), { schemaVersion: "0.11.0", clusters: creativeBrief.scenes.map(scene => ({ clusterId: scene.id, managementQuestion: scene.managementQuestion, sourceUnitRefs: scene.sourceUnitRefs })) });
  writeJson(path.join(outputDir, "build-manifest.json"), { schemaVersion: SCHEMA_VERSION, sourceSetHash: state.sourceSetHash, structureHash: state.structureHash, currentSceneOrder: orders, affectedSceneIds: orders, outputs: { html: "pending", formalPdf: "pending", pptx: "pending" }, generatedAt: new Date().toISOString() }); fs.writeFileSync(path.join(outputDir, "session-brief.md"), sessionBrief(state));
  const assembled = spawnSync(process.execPath, [path.join(here, "assemble-creative-report.mjs"), outputDir, path.join(outputDir, "report.html")], { encoding: "utf8", maxBuffer: 40_000_000 }); if (assembled.status !== 0) throw new Error(assembled.stderr || assembled.stdout || "Merged HTML assembly failed");
  const workFile = path.join(outputDir, `${brief.reportId}-review.mint-report.html`), packed = writePackageOutput("mint-report", outputDir, briefFile, null, workFile);
  return { outputDir, sections: brief.sections.length, scenes: orders.length, report: path.join(outputDir, "report.html"), selectedRevisions: Object.fromEntries(selected.map(item => [item.manifest.sectionId, item.manifest.revision])), ...packed };
}

function unpackWorkfile(inputFile, outputDir) {
  const entries = readPackageFile(inputFile), manifest = normalizedManifest(entries); verifyPackage(entries, manifest, path.basename(inputFile)); fs.mkdirSync(outputDir, { recursive: true });
  for (const [name, bytes] of entries) { if (name === "mint-package.json") continue; const file = path.join(outputDir, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, bytes); }
  writeJson(path.join(outputDir, "mint-package.json"), manifest); return { inputFile, outputDir, kind: manifest.kind, reportId: manifest.reportId, sectionId: manifest.sectionId || null, revision: manifest.revision, contentHash: manifest.contentHash };
}
function exportTechnicalZip(inputFile, outputZip) { const entries = readPackageFile(inputFile), manifest = normalizedManifest(entries); verifyPackage(entries, manifest, path.basename(inputFile)); fs.writeFileSync(outputZip, createZip([...entries].map(([name, data]) => ({ name, data })))); return { inputFile, outputZip, bytes: fs.statSync(outputZip).size }; }

function usage() { console.error("Usage:\n  collaboration-package.mjs brief config.json task-card.json\n  collaboration-package.mjs pack-section project task-card section-id output.mint-section.html\n  collaboration-package.mjs merge task-card output-project section1.html section2.html ...\n  collaboration-package.mjs unpack workfile.html output-project\n  collaboration-package.mjs export-zip workfile.html output.zip\n  Legacy ZIP output remains accepted when the pack output ends in .zip"); process.exit(2); }

const command = process.argv[2];
try {
  if (command === "brief") { const input = path.resolve(process.argv[3] || ""), output = path.resolve(process.argv[4] || ""); if (!fs.existsSync(input) || !output) usage(); const brief = validateBrief(readJson(input)); writeJson(output, brief); console.log(JSON.stringify({ passed: true, output, reportId: brief.reportId, sections: brief.sections.length }, null, 2)); }
  else if (command === "pack-section") { const project = path.resolve(process.argv[3] || ""), brief = path.resolve(process.argv[4] || ""), sectionId = process.argv[5], output = path.resolve(process.argv[6] || ""), companion = process.argv[7] ? path.resolve(process.argv[7]) : null; if (![project, brief].every(fs.existsSync) || !sectionId || !output) usage(); console.log(JSON.stringify({ passed: true, ...writePackageOutput("mint-section", project, brief, sectionId, output, companion) }, null, 2)); }
  else if (command === "merge") { const brief = path.resolve(process.argv[3] || ""), output = path.resolve(process.argv[4] || ""), packages = process.argv.slice(5).map(file => path.resolve(file)); if (!fs.existsSync(brief) || !output || packages.length < 1 || packages.some(file => !fs.existsSync(file))) usage(); console.log(JSON.stringify({ passed: true, ...mergePackages(brief, output, packages) }, null, 2)); }
  else if (command === "pack-report") { const project = path.resolve(process.argv[3] || ""), brief = path.resolve(process.argv[4] || ""), output = path.resolve(process.argv[5] || ""), companion = process.argv[6] ? path.resolve(process.argv[6]) : null; if (![project, brief].every(fs.existsSync) || !output) usage(); console.log(JSON.stringify({ passed: true, ...writePackageOutput("mint-report", project, brief, null, output, companion) }, null, 2)); }
  else if (command === "unpack") { const input = path.resolve(process.argv[3] || ""), output = path.resolve(process.argv[4] || ""); if (!fs.existsSync(input) || !output) usage(); console.log(JSON.stringify({ passed: true, ...unpackWorkfile(input, output) }, null, 2)); }
  else if (command === "export-zip") { const input = path.resolve(process.argv[3] || ""), output = path.resolve(process.argv[4] || ""); if (!fs.existsSync(input) || !output) usage(); console.log(JSON.stringify({ passed: true, ...exportTechnicalZip(input, output) }, null, 2)); }
  else usage();
} catch (error) { console.error(JSON.stringify({ passed: false, error: error.message }, null, 2)); process.exit(1); }
