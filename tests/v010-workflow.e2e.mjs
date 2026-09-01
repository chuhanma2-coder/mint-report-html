import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'mint-v010-incremental-')),project=path.join(temp,'project'),source=path.join(temp,'source.md');
fs.writeFileSync(source,'# 经营进展\n周报系统已覆盖140个贷款页面。\n周报系统已把分析范围从利率扩展到成本费用。\n\n# 下一步\n项目团队首先进行小额测试。\n项目团队其次扩大样本范围。\n项目团队最后根据结果决定推广。\n');
const run=(phase,...args)=>spawnSync(process.execPath,[path.join(root,'scripts/run-creative-workflow.mjs'),phase,...args],{env:process.env,encoding:'utf8',maxBuffer:30_000_000});
const pass=r=>assert.equal(r.status,0,r.stderr||r.stdout);
const read=f=>JSON.parse(fs.readFileSync(path.join(project,f),'utf8'));
pass(run('prepare',source,project));
for(const f of fs.readdirSync(path.join(project,'src/scenes')).filter(n=>n.endsWith('.html'))) { const p=path.join(project,'src/scenes',f);fs.writeFileSync(p,fs.readFileSync(p,'utf8').replace(' data-scene-status="placeholder"','')); }
pass(run('review',project));
assert.ok(!fs.readFileSync(path.join(project,'report.html'),'utf8').includes('window.mintInteractions ='),'ordinary report does not bundle the graph runtime');
const timings={review:read('performance-report.json').elapsedMs,revisions:[]};
const id=read('project-state.json').currentSceneOrder[0],css=path.join(project,'src/scenes',id+'.css');
for(const gap of [30,32]) {
  fs.writeFileSync(css,fs.readFileSync(css,'utf8').replace(/gap:\s*\d+px/,`gap: ${gap}px`));
  pass(run('revision',project)); const perf=read('performance-report.json');
  assert.deepEqual(perf.checkedScenes,[id]);assert.deepEqual(perf.assembly.compiledSceneIds,[id]);
  assert.equal(perf.assembly.reusedSceneIds.length,1); assert.equal(perf.normalizationRuns,0);assert.equal(perf.modelCallsByScripts,0);
  assert.equal(read('project-state.json').pdfState,'stale'); timings.revisions.push(perf.elapsedMs);
}
const good=fs.readFileSync(path.join(project,'report.html')),build=fs.readFileSync(path.join(project,'build-manifest.json'));
const file=path.join(project,'src/scenes',id+'.html');
fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace('</h2>','</h2><div data-qa-role="decoration" data-element-id="blocking-overlay" data-qa-overlap="forbid" style="position:absolute;inset:0;background:var(--mint-jade);z-index:30"></div>'));
const failed=run('revision',project);assert.notEqual(failed.status,0,'covering all text cannot be delivered');
assert.deepEqual(fs.readFileSync(path.join(project,'report.html')),good);
assert.deepEqual(fs.readFileSync(path.join(project,'build-manifest.json')),build);
assert.equal(read('.work/last-attempt.json').passed,false);assert.equal(read('project-state.json').deliveryStatus,'repair-required');
console.log(JSON.stringify({passed:true,timings,changedSceneOnly:true,lastGoodSurvivesCollision:true,project}));
