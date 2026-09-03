#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=file=>fs.readFileSync(path.join(root,file),"utf8");
const skill=read("SKILL.md");
const exportState=read("assets/mint-export-state.js");
const visualQa=read("scripts/visual-qa-creative.mjs");
const extractor=read("scripts/extract-ppt-layout.mjs");
const pptx=read("scripts/export-editable-pptx.mjs");
const pdfRenderer=read("scripts/pdf-renderer.mjs");
const windows=read("scripts/install-windows.ps1");

assert.match(skill,/HTML is the authoritative workfile and visual baseline/i,"Skill必须明确HTML是主产品和视觉基准");
assert.match(skill,/must not simplify or downgrade HTML/i,"PPT或PDF不得反向降低HTML效果");
assert.doesNotMatch(exportState,/window\.print\s*\(/,"本地PDF导出不得回退到window.print");
assert.match(exportState,/renderSceneToBitmap/);
assert.match(exportState,/Scene Capture Gate/);
assert.match(visualQa,/captureScenesToPdf/,"正式发布必须复用场景截图PDF管线");
assert.doesNotMatch(visualQa,/\.pdf\(\{\s*path:/,"正式发布不得直接打印原始HTML");
assert.match(extractor,/semanticContainer/,"PPT布局提取必须保留正式卡片和容器");
assert.match(extractor,/tableStyle/,"PPT表格必须携带HTML语义样式");
assert.match(pptx,/validateMediaData/,"PPT导出前必须验证媒体可解码");
assert.match(pptx,/mediaPlacement/,"PPT媒体适配器必须读取HTML保存的缩放和焦点位置");
assert.match(pdfRenderer,/verifyRenderedPdf/,"正式PDF必须重新渲染成品后再判定成功");
assert.match(pdfRenderer,/compareRasters/,"PDF成品门禁必须检查覆盖率和感知差异");
assert.match(pptx,/PPT geometry gate failed/,"PPT必须阻断越界和过度缩字");
assert.match(pptx,/PPT visual gate failed/,"PPT必须与HTML视觉基准比较");
assert.match(windows,/skill-backups/,"Windows更新必须先保留旧版备份");
assert.doesNotMatch(pptx,/fill:\"#087c66\",textStyle:\{bold:true,color:\"#ffffff\",fontSize:22/,"PPT表格不得硬编码统一深绿表头");
console.log(JSON.stringify({passed:true,htmlProtected:true,pdfPipelineUnified:true,pptSemantics:true}));
