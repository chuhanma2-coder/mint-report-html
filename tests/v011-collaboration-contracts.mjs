#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createZip, readZip } from "../scripts/mint-zip.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "mint-collab-"));
const write = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`); };
const run = args => { const result=spawnSync(process.execPath,[path.join(root,"scripts",args[0]),...args.slice(1)],{encoding:"utf8",maxBuffer:20_000_000});assert.equal(result.status,0,result.stderr||result.stdout);return result };

function fixture(name, title, value) {
  const project=path.join(temp,name),sceneId="MC-one";
  const scene={id:sceneId,managementQuestion:"结论是什么？",sceneAnswer:title,displayTitle:title,titleContract:{role:"content",maxLines:2,minPx:72,maxPx:104,preferredBreaks:[],orphanMinChars:3,letterSpacing:0},relationTypes:["comparison"],atomRefs:["A1"],sourceUnitRefs:["SU1"],mustShow:["A1"],expandableDetails:[],risksAndBoundaries:[],interactionOpportunities:[],compositionIntent:`${name}-composition`,readingAxis:"top-to-bottom",densityProfile:"focused",repeatReason:null};
  const map={schemaVersion:"0.11.0",sourceUnits:[{id:"SU1",text:value,textHash:name,sourceRef:`SOURCE:${name}`}],discourseUnits:[],numericClaims:[],contentAtoms:[{id:"A1",text:value,sourceUnitRefs:["SU1"]}],entities:[],relationships:[],semanticGraph:{nodes:[],edges:[]}};
  write(path.join(project,"creative-brief.json"),{schemaVersion:"0.11.0",status:"planned",narrativeSpine:["evidence"],scenes:[scene],artDirection:{brandAnchors:["Mint"],visualMood:"清新",motionLanguage:["scene-reveal"],densityRhythm:["focused"],palette:"mint-scheme-c-original",canvasMode:"dual-fixed-desktop-controlled-mobile",densityMode:"reading-first"},hardBoundaries:[],blockingIssues:[]});
  write(path.join(project,"content-map.json"),map);write(path.join(project,"source-lock.json"),{schemaVersion:"0.11.0",unitCount:1,unitIds:["SU1"],unitDigests:{SU1:name},immutable:true});write(path.join(project,"source-ledger.json"),{schemaVersion:"0.11.0",entries:[{sourceUnitRef:"SU1",atomRefs:["A1"],sceneIds:[sceneId],disposition:"formal-visible",placements:{html:"visible",pdf:"visible",pptx:"planned-native"}}]});
  write(path.join(project,"project-state.json"),{schemaVersion:"0.11.0",sourceSetHash:name,structureHash:name,currentSceneOrder:[sceneId],structureState:"frozen",qaProfile:"review",affectedSceneIds:[sceneId],openIssues:[]});write(path.join(project,"build-manifest.json"),{outputs:{}});
  write(path.join(project,"report-model.json"),{schemaVersion:"0.11.0",sceneById:{[sceneId]:scene},atoms:{A1:value},tables:{T1:{columns:["国家","数值"],rows:[[name,"1"]]}},charts:{C1:{type:"bar",title:"比较",unit:"个",period:"当前",source:"原始材料",categories:[name],series:[{name:"实际",values:[1]},{name:"目标",values:[2]}]}},media:{M1:{dataUrl:"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='20'%3E%3Crect width='40' height='20' fill='%23087C66'/%3E%3C/svg%3E",alt:"示例图"}},diagrams:{D1:{nodes:[{id:"n1",label:"起点"}],edges:[]}},userEdits:[]});
  const typed=name==="product"?'<div data-element-id="chart" data-content-id="A1" data-field-path="charts.C1" data-edit-policy="editable" data-edit-kind="chart" data-qa-role="node" data-qa-overlap="forbid"></div><div data-element-id="media" data-content-id="A1" data-field-path="media.M1" data-edit-policy="editable" data-edit-kind="media" data-qa-role="media" data-qa-overlap="forbid"></div>':'<div data-element-id="table" data-content-id="A1" data-field-path="tables.T1" data-edit-policy="editable" data-edit-kind="table" data-qa-role="node" data-qa-overlap="forbid"></div><div aria-label="关系图" data-element-id="diagram" data-content-id="A1" data-field-path="diagrams.D1" data-edit-policy="editable" data-edit-kind="diagram" data-qa-role="node" data-qa-overlap="forbid"></div>';
  write(path.join(project,"src/scenes",`${sceneId}.html`),`<section class="mint-scene" data-scene-id="${sceneId}"><div class="mint-scene__viewport"><div class="mint-scene__stage"><h2 data-element-id="title" data-content-id="A1" data-field-path="sceneById.${sceneId}.displayTitle" data-edit-policy="editable" data-qa-role="text" data-qa-overlap="forbid" data-title-contract data-title-role="content">${title}</h2><p data-element-id="atom" data-content-id="A1" data-atom-ref="A1" data-field-path="atoms.A1" data-edit-policy="editable" data-qa-role="text" data-qa-overlap="forbid">${value}</p>${typed}</div></div></section>`);
  write(path.join(project,"src/scenes",`${sceneId}.css`),`[data-scene-id="${sceneId}"] .mint-scene__stage{display:grid;grid-template-rows:120px 80px 250px 250px;align-content:center;gap:20px}[data-scene-id="${sceneId}"] [data-edit-kind]{min-height:120px;overflow:hidden}`);
  run(["assemble-creative-report.mjs",project,path.join(project,"report.html")]);return project;
}

const briefConfig=path.join(temp,"brief-config.json"),brief=path.join(temp,"report.mint-task.json");
write(briefConfig,{reportId:"weekly-review",title:"经营例会",outlineOrder:["1","2"],sections:[{id:"product",title:"产品",order:1,owner:"A",outlineItems:["1"]},{id:"finance",title:"财务",order:2,owner:"B",outlineItems:["2"]}]});
run(["collaboration-package.mjs","brief",briefConfig,brief]);
const product=fixture("product","产品结论","产品事实"),finance=fixture("finance","财务结论","财务事实");
const productWork=path.join(temp,"product.mint-section.html"),financeWork=path.join(temp,"finance.mint-section.html");
run(["collaboration-package.mjs","pack-section",product,brief,"product",productWork]);run(["collaboration-package.mjs","pack-section",finance,brief,"finance",financeWork]);
assert.match(fs.readFileSync(productWork,"utf8"),/id="mint-package-data"/);
const renamedProduct=path.join(temp,"A-final-renamed.html");fs.copyFileSync(productWork,renamedProduct);
const unpacked=path.join(temp,"unpacked-product");run(["collaboration-package.mjs","unpack",renamedProduct,unpacked]);assert.equal(JSON.parse(fs.readFileSync(path.join(unpacked,"mint-package.json"),"utf8")).sectionId,"product");
const merged=path.join(temp,"merged");run(["collaboration-package.mjs","merge",brief,merged,renamedProduct,financeWork]);
const mergedBrief=JSON.parse(fs.readFileSync(path.join(merged,"creative-brief.json"),"utf8")),mergedModel=JSON.parse(fs.readFileSync(path.join(merged,"report-model.json"),"utf8")),html=fs.readFileSync(path.join(merged,"report.html"),"utf8");
assert.equal(mergedBrief.scenes.length,2);assert.equal(new Set(mergedBrief.scenes.map(scene=>scene.id)).size,2);assert.equal(Object.keys(mergedModel.charts).length,2);assert.equal(Object.keys(mergedModel.tables).length,2);assert.ok(mergedBrief.scenes.every(scene=>/^section-[A-Za-z0-9._-]+__/.test(scene.id)));assert.match(html,/data-save-workfile/);assert.doesNotMatch(html,/<span class="mint-nav__progress"/);assert.ok(fs.existsSync(path.join(merged,"weekly-review-review.mint-report.html")));
const productZip=path.join(temp,"product-technical.zip");run(["collaboration-package.mjs","export-zip",productWork,productZip]);
const corruptEntries=[...readZip(productZip)].map(([name,data])=>({name,data:name==="report-model.json"?Buffer.from(`${data.toString("utf8")} `):data})),corruptZip=path.join(temp,"product-corrupt.mint-section.zip");fs.writeFileSync(corruptZip,createZip(corruptEntries));
const rejected=spawnSync(process.execPath,[path.join(root,"scripts/collaboration-package.mjs"),"merge",brief,path.join(temp,"corrupt-merge"),corruptZip,financeWork],{encoding:"utf8",maxBuffer:20_000_000});assert.notEqual(rejected.status,0);assert.match(rejected.stderr,/integrity check/);
const task=JSON.parse(fs.readFileSync(brief,"utf8"));assert.equal(task.schemaVersion,"0.12.0");assert.equal(task.designContract.aspectRatio,"16:9");assert.equal(task.publish.pageNumbers,false);
console.log(JSON.stringify({passed:true,sections:2,scenes:2,namespaced:true,typedModelsMerged:true,workfileOnly:true,renameSafe:true,unpackable:true,temp,merged,brief,productWork,financeWork,productZip,productPreview:productWork,mergedWork:path.join(merged,"weekly-review-review.mint-report.html")}));
