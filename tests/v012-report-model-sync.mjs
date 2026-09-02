#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createReportModel } from "../scripts/report-model.mjs";

const project=fs.mkdtempSync(path.join(os.tmpdir(),"mint-model-sync-")),scene={id:"MC-1",sceneAnswer:"原始结论",displayTitle:"原始标题",interactiveModules:[{id:"current",type:"workflow",nodes:[],edges:[]}]};fs.writeFileSync(path.join(project,"creative-brief.json"),JSON.stringify({scenes:[scene]}));fs.writeFileSync(path.join(project,"content-map.json"),JSON.stringify({contentAtoms:[{id:"A1",text:"当前正文"}]}));fs.writeFileSync(path.join(project,"report-model.json"),JSON.stringify({sceneById:{"MC-1":{...scene,displayTitle:"领导已改标题",interactiveModules:[{id:"stale"}]}},atoms:{A1:"领导已改正文"},tables:{},charts:{},media:{},diagrams:{},userEdits:[]}));const model=createReportModel(project);assert.equal(model.sceneById["MC-1"].displayTitle,"领导已改标题");assert.equal(model.atoms.A1,"领导已改正文");assert.equal(model.sceneById["MC-1"].interactiveModules[0].id,"current");console.log(JSON.stringify({passed:true,userEditsPreserved:true,structureRefreshed:true}));
