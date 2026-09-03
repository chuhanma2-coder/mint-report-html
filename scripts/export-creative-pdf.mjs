#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { captureScenesToPdf } from "./pdf-renderer.mjs";

const input=path.resolve(process.argv[2]||""),pdfFile=path.resolve(process.argv[3]||path.join(path.dirname(input||"."),"report.pdf")),manifestFile=path.resolve(process.argv[4]||path.join(path.dirname(pdfFile),"export-manifest.json")),kind=process.argv.find(arg=>arg.startsWith("--kind="))?.slice(7)||"formal";
if(!fs.existsSync(input)){console.error("Usage: node export-creative-pdf.mjs report.html [report.pdf] [export-manifest.json]");process.exit(2)}
const moduleName=process.env.MINT_PLAYWRIGHT_MODULE||"playwright",playwright=await import(moduleName.startsWith("/")?pathToFileURL(moduleName).href:moduleName),chromium=playwright.chromium||playwright.default?.chromium,browser=await chromium.launch({headless:true,executablePath:process.env.MINT_CHROMIUM_EXECUTABLE||undefined});
try{const page=await browser.newPage({viewport:{width:1920,height:1080}});await page.goto(pathToFileURL(input).href,{waitUntil:"load"});const manifest=await captureScenesToPdf({page,browser,input,pdfFile,manifestFile,kind});await page.close();console.log(JSON.stringify({passed:true,pdfFile,manifestFile,contentHash:manifest.contentHash,sceneCaptureGate:true,pdfArtifactGate:true},null,2))}finally{await browser.close()}
