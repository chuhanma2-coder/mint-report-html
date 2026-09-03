#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

export function pptLayoutInPage() {
  const model = JSON.parse(document.querySelector("#mint-creative-data")?.textContent || "{}");
  const blocked = new Set(["__proto__", "constructor", "prototype"]);
  const get = fieldPath => { let value=model; for(const part of String(fieldPath||"").split(".")){if(blocked.has(part)||!Object.hasOwn(value||{},part))return null;value=value[part]}return value };
  const color = value => { const match=String(value||"").match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);if(!match||Number(match[4]||1)===0)return null;return `#${[match[1],match[2],match[3]].map(item=>Number(item).toString(16).padStart(2,"0")).join("")}` };
  const visible = node => { const style=getComputedStyle(node),box=node.getBoundingClientRect();return style.display!=="none"&&style.visibility!=="hidden"&&box.width>0&&box.height>0 };
  const frame = (node, stage, text = false) => { const stageBox=stage.getBoundingClientRect(),box=node.getBoundingClientRect(),scale=stageBox.width/1920,style=getComputedStyle(node),naturalHeight=text?Math.max(box.height/scale,(parseFloat(style.lineHeight)||parseFloat(style.fontSize)||16)+4):box.height/scale,top=(box.top-stageBox.top)/scale-(naturalHeight-box.height/scale)/2;return { left:(box.left-stageBox.left)/scale,top,width:box.width/scale,height:naturalHeight } };
  const styleFor = node => { const style=getComputedStyle(node);return { color:color(style.color)||"#18312a",fill:color(style.backgroundColor),borderColor:color(style.borderColor),borderWidth:parseFloat(style.borderWidth)||0,borderLeftColor:color(style.borderLeftColor),borderLeftWidth:parseFloat(style.borderLeftWidth)||0,borderTopColor:color(style.borderTopColor),borderTopWidth:parseFloat(style.borderTopWidth)||0,borderRadius:parseFloat(style.borderRadius)||0,fontSize:parseFloat(style.fontSize)||32,fontWeight:Number(style.fontWeight)||400,fontFamily:style.fontFamily.split(",")[0].replaceAll('"',"").trim(),textAlign:style.textAlign,lineHeight:parseFloat(style.lineHeight)||null,opacity:Number(style.opacity)||1,objectFit:style.objectFit||null } };
  const tableStyle = node => { const header=node.querySelector("th"),body=node.querySelector("td"),table=node.querySelector("table")||node;return { header:header?styleFor(header):null,body:body?styleFor(body):null,borderColor:color(getComputedStyle(header||body||table).borderColor)||"#d4e2dd",cellPadding:header?parseFloat(getComputedStyle(header).paddingLeft)||8:8 } };
  const normalizedTyped = (kind,value) => {
    if(kind==="diagram"&&Array.isArray(value?.rows)&&value.rows.length&&value.rows.every(row=>row.country&&Number.isFinite(Number(row.monthlyActive))&&Number.isFinite(Number(row.whitelist))))return {kind:"chart",value:{type:"horizontal-bar",title:value.title||"国家经营规模比较",unit:value.unit||"万",categories:value.rows.map(row=>row.country),series:[{name:"月活",values:value.rows.map(row=>Number(row.monthlyActive))},{name:"白名单",values:value.rows.map(row=>Number(row.whitelist))}],sourceDiagram:true}};
    return {kind,value};
  };
  const semanticContainer = (node,stage) => { if(!node||node===stage||node.classList.contains("mint-scene__viewport")||node.classList.contains("mint-scene")||node.dataset.pptIgnore==="true")return false;const style=styleFor(node),box=node.getBoundingClientRect(),stageBox=stage.getBoundingClientRect(),explicit=node.hasAttribute("data-ppt-container");return explicit||((style.fill||style.borderWidth>0)&&box.width>24&&box.height>20&&box.width<stageBox.width*.98&&box.height<stageBox.height*.98) };
  const diagramLayout = (node,stage) => ({nodes:[...node.querySelectorAll("[data-node-id]")].filter(visible).map(item=>({id:item.dataset.nodeId,text:item.innerText.trim(),frame:frame(item,stage,true),style:styleFor(item)})),edgeLabels:[...node.querySelectorAll('[data-field-path*=".edges."]')].filter(visible).map(item=>({text:item.innerText.trim(),frame:frame(item,stage,true),style:styleFor(item)}))});
  const scenes = [...document.querySelectorAll(".mint-scene")].map(scene => {
    const stage=scene.querySelector(".mint-scene__stage"),typed=[...stage.querySelectorAll("[data-edit-kind][data-field-path]")].filter(visible),typedSet=new Set(typed),objects=[];
    const formal=[...stage.querySelectorAll('[data-field-path][data-qa-role="text"], [data-edit-kind][data-field-path]')].filter(visible),containers=new Set();for(const node of formal){if(!typed.some(parent=>parent.contains(node))&&semanticContainer(node,stage))containers.add(node);for(let parent=node.parentElement;parent&&parent!==stage;parent=parent.parentElement)if(semanticContainer(parent,stage))containers.add(parent)}
    for(const node of containers)objects.push({kind:"shape",semanticContainer:true,elementId:node.dataset.elementId||null,frame:frame(node,stage),style:styleFor(node),geometry:node.dataset.pptGeometry||"roundRect"});
    for(const node of [...stage.querySelectorAll('[data-ppt-kind="shape"]')].filter(visible)) objects.push({kind:"shape",semanticContainer:true,elementId:node.dataset.elementId,frame:frame(node,stage),style:styleFor(node),geometry:node.dataset.pptGeometry||"rect"});
    for(const node of [...stage.querySelectorAll('[data-field-path][data-qa-role="text"]')].filter(visible)){if([...typedSet].some(parent=>parent.contains(node)))continue;objects.push({kind:"text",elementId:node.dataset.elementId,fieldPath:node.dataset.fieldPath,contentId:node.dataset.contentId,text:node.innerText.trim(),frame:frame(node,stage,true),style:styleFor(node),titleRole:node.dataset.titleRole||null})}
    for(const node of typed){const normalized=normalizedTyped(node.dataset.pptKind||node.dataset.editKind,get(node.dataset.fieldPath)),typedStyle=styleFor(node),image=node.querySelector("img");if(normalized.kind==="media"&&image)typedStyle.objectFit=getComputedStyle(image).objectFit||typedStyle.objectFit;objects.push({kind:normalized.kind,elementId:node.dataset.elementId,fieldPath:node.dataset.fieldPath,contentId:node.dataset.contentId,value:normalized.value,frame:frame(node,stage),style:typedStyle,...(normalized.kind==="table"?{tableStyle:tableStyle(node)}:{}),...(normalized.kind==="diagram"?{diagramLayout:diagramLayout(node,stage)}:{})})}
    return { id:scene.dataset.sceneId,title:scene.querySelector("[data-title-contract]")?.innerText.trim()||scene.dataset.sceneId,background:color(getComputedStyle(stage).backgroundColor)||"#f7fbf9",objects };
  });
  return { schemaVersion:"0.12.0",slideSize:{width:1920,height:1080},contentHash:document.querySelector('meta[name="mint-content-hash"]')?.content||null,scenes };
}

async function loadPlaywright() {
  if (process.env.MINT_PLAYWRIGHT_MODULE) return import(process.env.MINT_PLAYWRIGHT_MODULE.startsWith("/") ? pathToFileURL(process.env.MINT_PLAYWRIGHT_MODULE).href : process.env.MINT_PLAYWRIGHT_MODULE);
  if (!process.env.RUNTIME_NODE_MODULES) return import("playwright");
  const require = createRequire(path.join(process.env.RUNTIME_NODE_MODULES, "package.json")); return import(pathToFileURL(require.resolve("playwright")).href);
}

async function main() {
  const input = path.resolve(process.argv[2] || ""), output = path.resolve(process.argv[3] || path.join(path.dirname(input || "."), "ppt-layout.json")), snapshotArg = process.argv.find(arg => arg.startsWith("--snapshot="))?.slice(11);
  if (!fs.existsSync(input)) { console.error("Usage: extract-ppt-layout.mjs report.html [ppt-layout.json] [--snapshot=publish-snapshot.json]"); process.exit(2); }
  let layout, errors=[];
  if (snapshotArg) { const snapshot=JSON.parse(fs.readFileSync(path.resolve(snapshotArg),"utf8"));layout=snapshot.layout;if(!layout)throw new Error("Publish snapshot does not contain PPT layout"); }
  else {
    const playwright=await loadPlaywright(),chromium=playwright.chromium||playwright.default?.chromium;if(!chromium)throw new Error("Playwright Chromium runtime is unavailable");const browser=await chromium.launch({headless:true,executablePath:process.env.MINT_CHROMIUM_EXECUTABLE||undefined});
    try{const page=await browser.newPage({viewport:{width:1920,height:1080},reducedMotion:"reduce"});page.on("pageerror",error=>errors.push(error.message));await page.goto(pathToFileURL(input).href,{waitUntil:"load"});await page.evaluate(()=>document.fonts.ready);layout=await page.evaluate(pptLayoutInPage)}finally{await browser.close()}
  }
  if(errors.length)throw new Error(`HTML runtime errors: ${errors.join("; ")}`);
  const unsupported=layout.scenes.flatMap(scene=>scene.objects.filter(object=>!["text","table","chart","media","diagram","shape"].includes(object.kind)).map(object=>`${scene.id}:${object.kind}`));if(unsupported.length)throw new Error(`Unsupported PPT business objects: ${unsupported.join(", ")}`);
  const overflow=layout.scenes.flatMap(scene=>scene.objects.filter(object=>object.frame.left < -1||object.frame.top < -1||object.frame.left+object.frame.width>layout.slideSize.width+1||object.frame.top+object.frame.height>layout.slideSize.height+1).map(object=>`${scene.id}:${object.elementId||object.kind}`));if(overflow.length)throw new Error(`PPT geometry is outside the 16:9 canvas: ${overflow.join(", ")}`);
  fs.writeFileSync(output,`${JSON.stringify(layout,null,2)}\n`);console.log(JSON.stringify({passed:true,scenes:layout.scenes.length,objects:layout.scenes.reduce((sum,scene)=>sum+scene.objects.length,0),snapshotReused:Boolean(snapshotArg),output},null,2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.stack || error.message); process.exit(1); });
