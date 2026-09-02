#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const input = path.resolve(process.argv[2] || ""), output = path.resolve(process.argv[3] || path.join(process.cwd(), "capacity-report.json"));
if (!fs.existsSync(input)) { console.error("Usage: capacity-preflight.mjs source-file-or-directory [capacity-report.json]"); process.exit(2); }
const supported = new Set([".md", ".txt", ".html", ".htm", ".docx", ".pptx", ".xlsx", ".pdf", ".png", ".jpg", ".jpeg"]);
function filesAt(target) { if (fs.statSync(target).isFile()) return [target]; const out=[]; const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name)).forEach(entry=>{const file=path.join(dir,entry.name);if(entry.isDirectory())walk(file);else if(supported.has(path.extname(entry.name).toLowerCase()))out.push(file)});walk(target);return out; }
function pdfPages(file) { const bytes=fs.readFileSync(file); return (bytes.toString("latin1").match(/\/Type\s*\/Page\b/g)||[]).length; }
const started=Date.now(), files=filesAt(input), byType={}, details=[];
for(const file of files){const extension=path.extname(file).toLowerCase().slice(1)||"unknown",bytes=fs.statSync(file).size;byType[extension]=(byType[extension]||0)+1;details.push({file:path.relative(fs.statSync(input).isDirectory()?input:path.dirname(input),file)||path.basename(file),extension,bytes,pages:extension==="pdf"?pdfPages(file):null,scanStatus:extension==="pdf"?"check-after-normalization":"not-applicable"})}
const bytes=details.reduce((sum,item)=>sum+item.bytes,0),knownPages=details.reduce((sum,item)=>sum+Number(item.pages||0),0),unknownPageFiles=details.filter(item=>item.pages==null&&["docx","pptx"].includes(item.extension)).length;
const limits={files:30,knownPages:100,bytes:180*1024*1024,assetsPerSection:20,embeddedBytesPerSection:60*1024*1024},reasons=[];
if(files.length>limits.files)reasons.push(`文件数 ${files.length} 超过 ${limits.files}`);if(knownPages>limits.knownPages)reasons.push(`已知页数 ${knownPages} 超过 ${limits.knownPages}`);if(bytes>limits.bytes)reasons.push(`源文件 ${Math.round(bytes/1024/1024)}MB 超过 ${Math.round(limits.bytes/1024/1024)}MB`);
const report={schemaVersion:"0.12.0",status:reasons.length?"over-reference-capacity":"within-reference-capacity",elapsedMs:Date.now()-started,metrics:{files:files.length,bytes,knownPages,unknownPageFiles,byType},limits,reasons,warnings:details.some(item=>item.extension==="pdf")?["PDF 是否为扫描件必须在规范化后确认；无文本层时进入 OCR，不计入 30 分钟标准用例"]:[],details};fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,`${JSON.stringify(report,null,2)}\n`);console.log(JSON.stringify({passed:true,status:report.status,elapsedMs:report.elapsedMs,metrics:report.metrics,reasons},null,2));
