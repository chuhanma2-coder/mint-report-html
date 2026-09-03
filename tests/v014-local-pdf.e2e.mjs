#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),".."),fixture=spawnSync(process.execPath,[path.join(root,"tests/v011-collaboration-contracts.mjs")],{encoding:"utf8",maxBuffer:20_000_000});assert.equal(fixture.status,0,fixture.stderr||fixture.stdout);const info=JSON.parse(fixture.stdout.trim().split("\n").at(-1));
const require=createRequire(path.join(process.env.RUNTIME_NODE_MODULES,"package.json")),playwright=await import(pathToFileURL(require.resolve("playwright")).href),chromium=playwright.chromium||playwright.default?.chromium,browser=await chromium.launch({headless:true,executablePath:process.env.MINT_CHROMIUM_EXECUTABLE||undefined});
try{const page=await browser.newPage({viewport:{width:1920,height:1080}});await page.goto(pathToFileURL(info.productWork).href,{waitUntil:"load"});const before=await page.locator(".mint-scene__stage").evaluate(node=>({html:node.innerHTML,className:node.className,style:node.getAttribute('style')})),result=await page.evaluate(async()=>{try{const blob=await window.mintPdfExport.captureLocalPdf();return {size:blob.size,type:blob.type}}catch(error){return {error:error.message,stack:error.stack}}});assert.ok(!result.error,result.stack||result.error);const after=await page.locator(".mint-scene__stage").evaluate(node=>({html:node.innerHTML,className:node.className,style:node.getAttribute('style')}));assert.equal(result.type,"application/pdf");assert.ok(result.size>12000);assert.deepEqual(after,before,"PDF适配器不得改变正式HTML Scene DOM");console.log(JSON.stringify({passed:true,fileProtocol:true,bytes:result.size,htmlUnchanged:true}))}finally{await browser.close()}
