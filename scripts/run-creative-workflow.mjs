#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { sceneInput, implementationHash, sha } from './scene-inputs.mjs';
import { promoteCandidate } from './promote-candidate.mjs';
import { sessionBrief } from '../core/scripts/project-state.mjs';
import { createReportModel } from './report-model.mjs';

const here = path.dirname(fileURLToPath(import.meta.url)), skill = path.dirname(here);
const command = process.argv[2], started = Date.now(), steps = [];
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const write = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
function attempt(script, args) {
  const time = Date.now();
  const result = spawnSync(process.execPath, [path.join(here, script), ...args], { encoding: 'utf8', maxBuffer: 40_000_000, env: process.env });
  steps.push({ script, elapsedMs: Date.now()-time, status: result.status });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.status !== 0 && result.stderr) process.stderr.write(result.stderr);
  return result;
}
function run(script, args) { if (attempt(script, args).status !== 0) throw new Error(`${script} failed`); }
if (command === 'prepare') {
  const source = path.resolve(process.argv[3] || ''), project = path.resolve(process.argv[4] || 'creative-output'), capacity = path.join(project, 'capacity-report.json');
  if (!fs.existsSync(source)) { console.error('Usage: run-creative-workflow.mjs prepare <source> <project> [options.json]'); process.exit(2); }
  run('capacity-preflight.mjs', [source, capacity]);
  const prepared = attempt('prepare-creative.mjs', process.argv.slice(3));
  fs.mkdirSync(project, { recursive: true });
  const assetFile = path.join(project, 'asset-manifest.json'), assets = fs.existsSync(assetFile) ? read(assetFile) : null;
  write(path.join(project, 'performance-report.json'), { schemaVersion: '0.12.0', phase: 'prepare', elapsedMs: Date.now()-started, capacity: read(capacity), normalization: assets?.metrics || null, modelCallsByScripts: 0, steps });
  process.exit(prepared.status || 0);
}
if (!['review', 'revision', 'publish'].includes(command)) { console.error('Usage: run-creative-workflow.mjs prepare|review|revision|publish <project>'); process.exit(2); }
const project = path.resolve(process.argv[3] || 'creative-output'), stateFile = path.join(project, 'project-state.json');
if (!fs.existsSync(stateFile)) { console.error('Run prepare first'); process.exit(2); }
const state = read(stateFile), profile = command;
if (profile === 'publish' && state.structureState !== 'frozen') { console.error('Publish blocked: structureState must be frozen'); process.exit(1); }
if (state.openIssues?.length) { console.error(`Resolve openIssues: ${state.openIssues.join('; ')}`); process.exit(1); }
const work = path.join(project, '.work'); fs.mkdirSync(path.join(work, 'candidates'), { recursive: true });
const candidate = fs.mkdtempSync(path.join(work, 'candidates', 'build-'));
const report = path.join(candidate, 'report.html'), qa = path.join(candidate, 'qa-report.json'), modelQa = path.join(candidate, 'model-qa.json'), visual = path.join(candidate, 'visual-qa.json');
const publishSnapshot = path.join(candidate,'publish-snapshot.json'), publishPdf = path.join(candidate,'report.pdf'), publishPdfManifest = path.join(candidate,'export-manifest.json');
const lastInputsFile = path.join(work, 'last-good-inputs.json');
const oldInputs = fs.existsSync(lastInputsFile) ? read(lastInputsFile) : null;
let affected = [], inputs;
try {
  const brief = read(path.join(project, 'creative-brief.json')), map = read(path.join(project, 'content-map.json'));
  const model = createReportModel(project);
  const assetFile = path.join(project, 'offline-asset-manifest.json');
  const assetHashes = fs.existsSync(assetFile) ? read(assetFile).assets.map(a => [a.file, fs.existsSync(path.join(project,a.file)) ? sha(fs.readFileSync(path.join(project,a.file))) : 'missing']) : [];
  inputs = { implementation: implementationHash(skill), order: state.currentSceneOrder, art: sha(JSON.stringify(brief.artDirection)), assets: assetHashes, scenes: Object.fromEntries(brief.scenes.map(s => [s.id,sceneInput(project,s,model).hash])) };
  const globalChange = !oldInputs || ['implementation','order','art','assets'].some(k => JSON.stringify(inputs[k]) !== JSON.stringify(oldInputs[k]));
  affected = profile !== 'revision' || globalChange ? state.currentSceneOrder : state.currentSceneOrder.filter(id => inputs.scenes[id] !== oldInputs.scenes[id]);
  if (!affected.length) { console.log(JSON.stringify({ passed: true, phase: profile, unchanged: true, checkedScenes: [], elapsedMs: Date.now()-started })); process.exit(0); }
  write(path.join(candidate,'project-state.json'), { ...state, qaProfile: profile, affectedSceneIds: affected });
  run('validate-scene-project.mjs', [project,modelQa]);
  const assemble = () => run('assemble-creative-report.mjs', [project,report,'--candidate',`--scenes=${affected.join(',')}`]);
  assemble();
  run('qa-creative-html.mjs', [report,path.join(project,'creative-brief.json'),qa]);
  const visualArgs = [report,visual,path.join(candidate,'visual-qa'),`--profile=${profile}`, ...(profile === 'revision' ? [`--scenes=${affected.join(',')}`] : []), ...(profile === 'publish' ? [`--publish-snapshot=${publishSnapshot}`,`--pdf-output=${publishPdf}`,`--pdf-manifest=${publishPdfManifest}`] : [])];
  if (attempt('visual-qa-creative.mjs',visualArgs).status !== 0) {
    const vr = fs.existsSync(visual) ? read(visual) : null;
    if (!vr?.issues?.length || !vr.issues.every(i => i.gate === 'geometry-collision')) throw new Error('browser-qa failed');
    run('repair-geometry.mjs',[project,visual,path.join(candidate,'geometry-repair.json')]);
    assemble(); run('qa-creative-html.mjs',[report,path.join(project,'creative-brief.json'),qa]); run('visual-qa-creative.mjs',visualArgs);
  }
  const files = ['report.html','qa-report.json','model-qa.json','visual-qa.json','assembly-report.json','offline-asset-manifest.json'];
  const exportPdf = profile === 'publish' || process.argv.includes('--preview-pdf');
  let pdfName, exportName;
  if (exportPdf) {
    pdfName = profile === 'publish' ? 'report.pdf' : 'report-preview.pdf'; exportName = profile === 'publish' ? 'export-manifest.json' : 'preview-export-manifest.json';
    if (profile !== 'publish') run('export-creative-pdf.mjs',[report,path.join(candidate,pdfName),path.join(candidate,exportName),'--kind=preview']);
    else if (!fs.existsSync(path.join(candidate,pdfName)) || !fs.existsSync(path.join(candidate,exportName)) || !fs.existsSync(publishSnapshot)) throw new Error('Publish browser session did not create PDF and snapshot');
    if (read(path.join(candidate,exportName)).status !== 'matched') throw new Error('PDF not current');
    files.push(pdfName,exportName);
    if (profile === 'publish') files.push('publish-snapshot.json');
  }
  const reportBriefFile = path.join(project,'report-brief.json');
  const reportBrief = fs.existsSync(reportBriefFile) ? read(reportBriefFile) : null;
  const exportPptx = profile === 'publish' && reportBrief?.publish?.formats?.includes('pptx');
  if (exportPptx) {
    if (!process.env.RUNTIME_NODE_MODULES) throw new Error('PPTX publish requires RUNTIME_NODE_MODULES from load_workspace_dependencies');
    const pptLayout = path.join(candidate,'ppt-layout.json'), pptx = path.join(candidate,'report.pptx'), renderDir = path.join(candidate,'pptx-render');
    run('extract-ppt-layout.mjs',[report,pptLayout,`--snapshot=${publishSnapshot}`]);
    run('export-editable-pptx.mjs',[pptLayout,pptx,renderDir]);
    fs.copyFileSync(path.join(renderDir,'montage.webp'),path.join(candidate,'pptx-montage.webp'));
    files.push('report.pptx','ppt-layout.json','pptx-manifest.json','pptx-montage.webp');
  }
  const current = { ...read(stateFile), qaProfile: profile, pdfState: exportPdf ? profile === 'publish' ? 'current' : 'preview-current' : 'stale', deliveryStatus: profile === 'publish' ? 'formal-ready' : `${profile}-ready`, affectedSceneIds: [], lastCompletedAction: `${profile}-validated`, pendingActions: profile === 'publish' ? [] : ['review-preview-and-freeze-structure-before-publish'], updatedAt: new Date().toISOString() };
  write(path.join(candidate,'project-state.json'),current);
  fs.writeFileSync(path.join(candidate,'session-brief.md'),sessionBrief(current));
  const buildFile = path.join(project,'build-manifest.json'), build = fs.existsSync(buildFile) ? read(buildFile) : { outputs: {} };
  build.outputs = { ...build.outputs, html: { file: 'report.html', hash: sha(fs.readFileSync(report)), state: 'current' }, formalPdf: profile === 'publish' ? { file: pdfName, hash: sha(fs.readFileSync(path.join(candidate,pdfName))), state: 'current' } : { ...(typeof build.outputs?.formalPdf === 'object' ? build.outputs.formalPdf : {}), state: 'stale' }, pptx: exportPptx ? { file: 'report.pptx', hash: sha(fs.readFileSync(path.join(candidate,'report.pptx'))), state: 'current', manifest: 'pptx-manifest.json' } : { ...(typeof build.outputs?.pptx === 'object' ? build.outputs.pptx : {}), state: 'not-requested' } };
  if (exportPdf && profile !== 'publish') build.outputs.previewPdf = { file: pdfName, hash: sha(fs.readFileSync(path.join(candidate,pdfName))), state: 'current' };
  else if (!exportPdf) build.outputs.previewPdf = { ...(typeof build.outputs?.previewPdf === 'object' ? build.outputs.previewPdf : {}), state: 'stale' };
  build.lastCandidate = path.relative(project,candidate); build.generatedAt = new Date().toISOString();
  write(path.join(candidate,'build-manifest.json'),build);
  const pptxManifest = exportPptx ? read(path.join(candidate,'pptx-manifest.json')) : null;
  const delivery = { schemaVersion: '0.11.0', status: current.deliveryStatus, structureState: current.structureState, qaProfile: profile, sceneOrder: current.currentSceneOrder, checks: { staticQa: read(qa).passed === true, browserQa: read(visual).passed === true, ...(profile === 'publish' ? { pdfCurrent: read(path.join(candidate,exportName)).status === 'matched' } : {}), ...(exportPptx ? { pptxCurrent: pptxManifest.contentHash === read(path.join(candidate,'ppt-layout.json')).contentHash, pptxNativeEditable: Object.values(pptxManifest.editableObjects || {}).reduce((sum,value)=>sum+value,0) > 0, pptxSixteenNine: pptxManifest.aspectRatio === '16:9', pptxNoPageChrome: !pptxManifest.headers && !pptxManifest.footers && !pptxManifest.pageNumbers } : {}) }, outputs: build.outputs };
  if (!Object.values(delivery.checks).every(Boolean)) throw new Error('Delivery gates incomplete');
  write(path.join(candidate,'delivery-manifest.json'),delivery);
  const capacityFile = path.join(project,'capacity-report.json');
  write(path.join(candidate,'performance-report.json'), { schemaVersion: '0.12.0', phase: profile, elapsedMs: Date.now()-started, capacity: fs.existsSync(capacityFile) ? read(capacityFile) : null, checkedScenes: affected, assembly: read(path.join(candidate,'assembly-report.json')), reuse: { normalizedAssets: fs.existsSync(path.join(project,'asset-manifest.json')) ? read(path.join(project,'asset-manifest.json')).metrics?.cacheHits || 0 : 0, compiledScenes: read(path.join(candidate,'assembly-report.json')).compiledSceneIds.length, reusedScenes: read(path.join(candidate,'assembly-report.json')).reusedSceneIds.length }, normalizationRuns: 0, modelCallsByScripts: 0, steps });
  files.push('performance-report.json','delivery-manifest.json','session-brief.md','project-state.json','build-manifest.json');
  promoteCandidate(candidate,project,files);
  inputs.scenes = Object.fromEntries(brief.scenes.map(s => [s.id,sceneInput(project,s,model).hash]));
  inputs.assets = read(path.join(candidate,'offline-asset-manifest.json')).assets.map(a => [a.file,a.hash]);
  write(lastInputsFile,inputs);
  write(path.join(work,'last-attempt.json'), { passed: true, candidate: path.relative(project,candidate), phase: profile });
  console.log(JSON.stringify({ passed: true, phase: profile, checkedScenes: affected, report: path.join(project,'report.html'), elapsedMs: Date.now()-started }));
} catch (error) {
  const failure = { passed: false, phase: profile, candidate: path.relative(project,candidate), error: error.message, lastGoodPreserved: fs.existsSync(path.join(project,'report.html')), changedScenes: affected, elapsedMs: Date.now()-started, steps };
  write(path.join(work,'last-attempt.json'), failure);
  write(stateFile, { ...read(stateFile), deliveryStatus: 'repair-required', pdfState: 'stale', affectedSceneIds: affected, lastCompletedAction: 'candidate-failed', pendingActions: [failure.candidate] });
  fs.writeFileSync(path.join(project,'session-brief.md'),sessionBrief(read(stateFile)));
  console.error(JSON.stringify(failure,null,2)); process.exit(1);
}
