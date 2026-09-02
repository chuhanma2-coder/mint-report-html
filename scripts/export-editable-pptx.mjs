#!/usr/bin/env node
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const layoutFile = path.resolve(process.argv[2] || ""), output = path.resolve(process.argv[3] || "report.pptx"), renderDir = path.resolve(process.argv[4] || path.join(path.dirname(output), "pptx-render"));
if (!fs.existsSync(layoutFile)) { console.error("Usage: export-editable-pptx.mjs ppt-layout.json output.pptx [render-dir]"); process.exit(2); }
if (!process.env.RUNTIME_NODE_MODULES) { console.error("RUNTIME_NODE_MODULES is required"); process.exit(2); }
const require = createRequire(path.join(process.env.RUNTIME_NODE_MODULES, "package.json"));
const { Presentation, PresentationFile } = await import(pathToFileURL(require.resolve("@oai/artifact-tool")).href);
const layout = JSON.parse(fs.readFileSync(layoutFile, "utf8"));
const deck = Presentation.create({ slideSize: layout.slideSize || { width: 1920, height: 1080 } });
const cleanColor = value => /^#[0-9a-f]{6}$/i.test(value || "") ? value : "#18312a";
const fill = value => value && /^#[0-9a-f]{6}$/i.test(value) ? value : "none";
const line = style => style?.borderWidth > 0 && style.borderColor ? { style: "solid", fill: style.borderColor, width: style.borderWidth } : { style: "solid", fill: "none", width: 0 };
const chartType = value => ({ column:"bar", "stacked-bar":"bar", ring:"doughnut", donut:"doughnut", box:"boxWhisker" })[value] || (["line","area","bar","pie","doughnut","scatter","bubble","radar","treemap","sunburst","map","waterfall","funnel","histogram","boxWhisker","pareto","combo"].includes(value) ? value : "bar");
function addText(slide, object) {
  const shape=slide.shapes.add({geometry:"textbox",name:object.elementId||object.fieldPath,position:object.frame,fill:fill(object.style.fill),line:line(object.style)});shape.text=String(object.text||"");
  shape.text.style={fontSize:Math.max(10,object.style.fontSize||28),bold:(object.style.fontWeight||400)>=600,color:cleanColor(object.style.color),typeface:object.style.fontFamily||"Microsoft YaHei",alignment:({center:"center",right:"right",justify:"justify"})[object.style.textAlign]||"left"};shape.text.verticalAlignment="middle";shape.text.autoFit="none";shape.text.insets={left:0,right:0,top:0,bottom:0};return shape;
}
function addTable(slide, object) {
  const value=object.value||{},values=[value.columns||[],...(value.rows||[])],columns=Math.max(1,...values.map(row=>row.length)),rows=Math.max(1,values.length);while(values.length<rows)values.push([]);for(const row of values)while(row.length<columns)row.push("");
  const table=slide.tables.add({rows,columns,left:object.frame.left,top:object.frame.top,width:object.frame.width,height:object.frame.height,values});table.styleOptions={headerRow:true,bandedRows:true};table.borders.assign({style:"solid",fill:"#d4e2dd",width:1});
  table.cells.block({row:0,column:0,rowCount:1,columnCount:columns}).assign({fill:"#087c66",textStyle:{bold:true,color:"#ffffff",fontSize:22,typeface:"Microsoft YaHei"}});if(rows>1)table.cells.block({row:1,column:0,rowCount:rows-1,columnCount:columns}).assign({textStyle:{color:"#18312a",fontSize:20,typeface:"Microsoft YaHei"}});return table;
}
function addChart(slide, object) {
  const value=object.value||{},type=chartType(value.type),palette=["#2f86a6","#f08a5d","#087c66","#7a6bb7","#d6a73c","#69766f"],series=(value.series||[]).map((item,index)=>({...item,values:(item.values||[]).map(Number),fill:palette[index%palette.length],line:{style:index===1&&["line","area"].includes(type)?"dash":"solid",fill:palette[index%palette.length],width:3}}));
  const hasNote=Boolean(value.period),numberFormat=value.numberFormat||"0.##",horizontal=type==="bar"&&value.type!=="column";
  const config={position:{...object.frame,height:Math.max(80,object.frame.height-(hasNote?32:0))},title:value.title||undefined,titlePlacement:value.title?"aboveChart":"none",titleTextStyle:{fontSize:24,fill:"#18312a",bold:true},categories:value.categories||[],series,hasLegend:series.length>1,legend:{position:"bottom",overlay:false,textStyle:{fontSize:16,fill:"#586b65"}},chartFill:"none",plotAreaFill:"none",xAxis:{title:horizontal?(value.unit||undefined):undefined,numberFormatCode:horizontal?numberFormat:undefined,textStyle:{fontSize:15,fill:"#586b65"},line:{style:"solid",fill:"#d4e2dd",width:1}},yAxis:{title:horizontal?undefined:(value.unit||undefined),numberFormatCode:horizontal?undefined:numberFormat,textStyle:{fontSize:15,fill:"#586b65"},majorGridlines:{style:"solid",fill:"#d4e2dd",width:1}},dataLabels:{showValue:true,position:"outEnd",textStyle:{fontSize:15,fill:"#18312a"}}};
  if(type==="bar")config.barOptions={direction:value.type==="column"?"column":"bar",grouping:value.type==="stacked-bar"?"stacked":"clustered",gapWidth:44};if(type==="line")config.lineOptions={grouping:"standard",smooth:false};if(type==="area")config.areaOptions={grouping:"standard"};
  const chart=slide.charts.add(type,config);
  if(value.period){const note=slide.shapes.add({geometry:"textbox",position:{left:object.frame.left,top:object.frame.top+object.frame.height-24,width:object.frame.width,height:24},fill:"none",line:{fill:"none",width:0}});note.text=value.period;note.text.style={fontSize:13,color:"#69766f",typeface:"Microsoft YaHei",alignment:"right"}}
  return chart;
}
function addMedia(slide, object) { const value=object.value||{},dataUrl=value.dataUrl||value.src;if(!dataUrl)return null;return slide.images.add({dataUrl,alt:value.alt||"汇报图片",fit:value.fit||"cover",position:object.frame,geometry:object.style.borderRadius>0?"roundRect":"rect",borderRadius:Math.max(0,object.style.borderRadius||0)}) }
function addDiagram(slide, object) {
  const value=object.value||{},nodes=value.nodes||[],edges=value.edges||[],gap=24,nodeWidth=(object.frame.width-gap*Math.max(0,nodes.length-1))/Math.max(1,nodes.length),shapes=new Map();
  for(const edge of edges){const fromIndex=Math.max(0,nodes.findIndex(node=>node.id===edge.from)),toIndex=Math.max(0,nodes.findIndex(node=>node.id===edge.to));const from={left:object.frame.left+fromIndex*(nodeWidth+gap),top:object.frame.top+object.frame.height/2,width:nodeWidth,height:1},to={left:object.frame.left+toIndex*(nodeWidth+gap),top:object.frame.top+object.frame.height/2,width:nodeWidth,height:1};slide.shapes.add({geometry:"line",position:{left:from.left+nodeWidth,top:from.top,width:Math.max(1,to.left-(from.left+nodeWidth)),height:1},fill:"none",line:{style:"solid",fill:"#087c66",width:3,endArrowType:edge.directed===false?"none":"triangle"}})}
  nodes.forEach((node,index)=>{const shape=slide.shapes.add({geometry:"roundRect",position:{left:object.frame.left+index*(nodeWidth+gap),top:object.frame.top+object.frame.height*.2,width:nodeWidth,height:object.frame.height*.6},fill:"#ffffff",line:{style:"solid",fill:"#087c66",width:2},borderRadius:"rounded-xl"});shape.text=String(node.label||node.text||node.id);shape.text.style={fontSize:20,bold:true,color:"#18312a",typeface:"Microsoft YaHei",alignment:"center"};shape.text.verticalAlignment="middle";shapes.set(node.id,shape)});return shapes;
}
for (const scene of layout.scenes) {
  const slide=deck.slides.add();slide.background.fill=scene.background||"#f7fbf9";
  for(const object of scene.objects.filter(item=>item.kind==="shape"))slide.shapes.add({geometry:object.geometry||"rect",position:object.frame,fill:fill(object.style.fill),line:line(object.style)});
  for(const object of scene.objects.filter(item=>item.kind!=="shape")){if(object.kind==="text")addText(slide,object);if(object.kind==="table")addTable(slide,object);if(object.kind==="chart")addChart(slide,object);if(object.kind==="media")addMedia(slide,object);if(object.kind==="diagram")addDiagram(slide,object)}
}
await fsp.mkdir(renderDir,{recursive:true});
for (const [index, slide] of deck.slides.items.entries()) { const stem=`slide-${String(index+1).padStart(2,"0")}`;const png=await deck.export({slide,format:"png",scale:1});await fsp.writeFile(path.join(renderDir,`${stem}.png`),new Uint8Array(await png.arrayBuffer()));const itemLayout=await slide.export({format:"layout"});await fsp.writeFile(path.join(renderDir,`${stem}.layout.json`),await itemLayout.text()) }
const montage=await deck.export({format:"webp",montage:true,scale:1});await fsp.writeFile(path.join(renderDir,"montage.webp"),new Uint8Array(await montage.arrayBuffer()));
const pptx=await PresentationFile.exportPptx(deck);await pptx.save(output);
const counts=layout.scenes.flatMap(scene=>scene.objects).reduce((result,object)=>(result[object.kind]=(result[object.kind]||0)+1,result),{});fs.writeFileSync(path.join(path.dirname(output),"pptx-manifest.json"),`${JSON.stringify({schemaVersion:"0.11.0",status:"current",contentHash:layout.contentHash,aspectRatio:"16:9",headers:false,footers:false,pageNumbers:false,slides:layout.scenes.length,editableObjects:counts,output,renderDir},null,2)}\n`);
console.log(JSON.stringify({passed:true,output,slides:layout.scenes.length,editableObjects:counts,renderDir},null,2));
