import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { compareRasters } from "./raster-compare.mjs";

const sha=value=>crypto.createHash("sha256").update(value).digest("hex");
const pageCount=bytes=>(bytes.toString("latin1").match(/\/Type\s*\/Page\b/g)||[]).length;

export async function prepareForExport(page) {
  await page.evaluate(()=>document.fonts.ready);
  const state=await page.evaluate(async()=>{
    const snapshot=window.mintFields?.prepareExport();await window.mintFields?.flush();
    const model=window.mintFields?.model?.()||{};if(model.pendingDependencyReviews?.length)throw new Error(`有 ${model.pendingDependencyReviews.length} 条图表关联结论待确认`);
    const images=[...document.images];await Promise.all(images.map(image=>image.decode()));
    const failed=images.filter(image=>!image.complete||image.naturalWidth<1),pending=document.querySelectorAll('[data-render-ready="false"]').length;
    if(failed.length)throw new Error(`有 ${failed.length} 张图片未加载`);if(pending)throw new Error(`有 ${pending} 个组件尚未完成渲染`);
    window.mintCreative?.setEditing(false);window.mintCreative?.closeModals();document.body.classList.add("exporting");
    document.querySelectorAll(".mint-scene").forEach(node=>node.classList.add("is-visible"));
    document.querySelectorAll("[data-reveal]").forEach(node=>{node.removeAttribute("data-reveal");node.style.cssText+=";opacity:1!important;visibility:visible!important;transform:none!important;transition:none!important"});
    document.querySelectorAll(".mint-details[hidden]").forEach(node=>{node.hidden=false});
    const style=document.createElement("style");style.dataset.mintExportAdapter="true";style.textContent=`html,body{margin:0!important;width:1920px!important}.mint-scene,.mint-scene__viewport{width:1920px!important;height:1080px!important;min-height:1080px!important;margin:0!important;padding:0!important;overflow:hidden!important}.mint-scene__stage{width:1920px!important;height:1080px!important;transform:none!important}.mint-nav,.mint-edit-status,.mint-control,.mint-modal,.mint-page-arrow,.mint-edit-toggle,.mint-chrome-restore{display:none!important}*{animation:none!important;transition:none!important}`;document.head.append(style);
    return {snapshot,modelText:document.querySelector("#mint-creative-data")?.textContent||"",sceneIds:[...document.querySelectorAll(".mint-scene")].map(node=>node.dataset.sceneId)};
  });
  await page.emulateMedia({media:"screen",reducedMotion:"reduce"});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));return state;
}

export async function renderScenesToBitmaps(page) {
  const scenes=await page.locator(".mint-scene").all(),captures=[];
  for(const scene of scenes){
    const id=await scene.getAttribute("data-scene-id"),stage=scene.locator(".mint-scene__stage"),box=await stage.boundingBox(),text=(await scene.innerText()).trim();
    if(!box||Math.abs(box.width-1920)>1||Math.abs(box.height-1080)>1)throw new Error(`Scene Capture Gate: ${id} 画布为 ${box?.width||0}×${box?.height||0}`);
    if(!text)throw new Error(`Scene Capture Gate: ${id} 没有正式内容`);
    const png=await stage.screenshot({type:"png",animations:"disabled"});if(png.length<12000)throw new Error(`Scene Capture Gate: ${id} 截图接近空白`);
    captures.push({id,width:1920,height:1080,png});
  }
  if(!captures.length)throw new Error("Scene Capture Gate: 没有可导出的Scene");return captures;
}

export async function assemblePdf(browser,captures,pdfFile) {
  const printPage=await browser.newPage({viewport:{width:1920,height:1080}});
  try{
    const html=`<!doctype html><html><head><style>@page{size:16in 9in;margin:0}html,body{margin:0;background:#fff}.pdf-scene{width:16in;height:9in;break-after:page;overflow:hidden}.pdf-scene:last-child{break-after:auto}.pdf-scene img{display:block;width:100%;height:100%;object-fit:contain}</style></head><body>${captures.map(item=>`<section class="pdf-scene"><img alt="" src="data:image/png;base64,${item.png.toString("base64")}"></section>`).join("")}</body></html>`;
    await printPage.setContent(html,{waitUntil:"load"});await printPage.evaluate(()=>Promise.all([...document.images].map(image=>image.decode())));fs.mkdirSync(path.dirname(pdfFile),{recursive:true});
    await printPage.pdf({path:pdfFile,width:"16in",height:"9in",printBackground:true,preferCSSPageSize:true,displayHeaderFooter:false,margin:{top:"0",right:"0",bottom:"0",left:"0"}});
  } finally {await printPage.close()}
}

async function verifyRenderedPdf(pdfFile,captures,kind){
  const executable=process.env.MINT_PDFTOPPM||"pdftoppm",probe=spawnSync(executable,["-v"],{encoding:"utf8"});
  if(probe.error||probe.status!==0){if(kind==="formal")throw new Error("PDF Artifact Gate: formal publish requires Poppler pdftoppm");return {performed:false,reason:"pdftoppm-unavailable"}}
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),"mint-pdf-verify-")),prefix=path.join(folder,"page");
  try{
    const rendered=spawnSync(executable,["-png","-r","120",pdfFile,prefix],{encoding:"utf8",maxBuffer:20_000_000});if(rendered.status!==0)throw new Error(`PDF Artifact Gate: PDF re-render failed: ${rendered.stderr||rendered.stdout}`);
    const pages=fs.readdirSync(folder).filter(name=>/^page-\d+\.png$/i.test(name)).sort();if(pages.length!==captures.length)throw new Error(`PDF Artifact Gate: rendered ${pages.length} pages for ${captures.length} Scenes`);
    const comparisons=[];for(let index=0;index<pages.length;index++){const result=await compareRasters(captures[index].png,path.join(folder,pages[index]),{minSimilarity:.88,maxHashDistance:16,maxCoverageDrop:.08});if(!result.passed)throw new Error(`PDF Artifact Gate: page ${index+1} differs from source Scene`);comparisons.push({sceneId:captures[index].id,...result})}
    return {performed:true,renderer:"poppler-120dpi",comparisons};
  } finally {fs.rmSync(folder,{recursive:true,force:true})}
}

export async function captureScenesToPdf({page,browser,input,pdfFile,manifestFile,kind="formal"}) {
  const state=await prepareForExport(page),captures=await renderScenesToBitmaps(page);await assemblePdf(browser,captures,pdfFile);
  const pdfBytes=fs.readFileSync(pdfFile),pdfPages=pageCount(pdfBytes);if(pdfPages!==captures.length||pdfBytes.length<captures.length*12000)throw new Error(`PDF Artifact Gate: PDF页数 ${pdfPages} 与Scene数 ${captures.length} 不一致或内容异常`);const renderedVerification=await verifyRenderedPdf(pdfFile,captures,kind);
  const contentHash=sha(state.modelText),original=fs.readFileSync(input,"utf8"),updated=original.replace(/<meta name="mint-pdf-state" content="[^"]*">/g,"").replace(/<meta name="mint-pdf-content-hash" content="[^"]*">/g,"").replace("</head>",`<meta name="mint-pdf-state" content="${kind==="formal"?"available":"preview"}"><meta name="mint-pdf-content-hash" content="${contentHash}"></head>`);fs.writeFileSync(input,updated);
  const manifest={schemaVersion:"0.15.0",status:"matched",kind,mode:"scene-capture-pipeline",rendererContract:"raster-scene/1",htmlFile:path.basename(input),pdfFile:path.basename(pdfFile),contentHash,htmlHash:sha(updated),pdfHash:sha(pdfBytes),sceneCount:captures.length,pdfPageCount:pdfPages,sceneCaptureGate:{passed:true,width:1920,height:1080,scenes:captures.map(item=>({id:item.id,bytes:item.png.length}))},pdfArtifactGate:{passed:true,pageCount:pdfPages,aspectRatio:"16:9",renderedVerification},generatedAt:new Date().toISOString()};fs.writeFileSync(manifestFile,`${JSON.stringify(manifest,null,2)}\n`);return manifest;
}
