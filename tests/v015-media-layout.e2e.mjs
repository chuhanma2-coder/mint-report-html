#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),".."),fixture=spawnSync(process.execPath,[path.join(root,"tests/v011-collaboration-contracts.mjs")],{encoding:"utf8",maxBuffer:20_000_000});
assert.equal(fixture.status,0,fixture.stderr||fixture.stdout);
const info=JSON.parse(fixture.stdout.trim().split("\n").at(-1));
const require=createRequire(path.join(process.env.RUNTIME_NODE_MODULES,"package.json")),playwright=await import(pathToFileURL(require.resolve("playwright")).href),chromium=playwright.chromium||playwright.default?.chromium,browser=await chromium.launch({headless:true,executablePath:process.env.MINT_CHROMIUM_EXECUTABLE||undefined});

try{
  const page=await browser.newPage({viewport:{width:1920,height:1080}});
  await page.goto(pathToFileURL(info.productPreview).href,{waitUntil:"load"});
  await page.keyboard.press("e");
  const media=page.locator('[data-edit-kind="media"]').first();
  await media.click();
  assert.equal(await page.locator('.mint-editor [name="fit"]').count(),1);
  assert.equal(await page.locator('.mint-editor [name="scale"]').count(),1);
  assert.equal(await page.locator('.mint-editor [name="positionX"]').count(),1);
  assert.equal(await page.locator('.mint-editor [name="positionY"]').count(),1);
  await page.locator('.mint-editor [name="fit"]').selectOption("contain");
  await page.locator('.mint-editor [name="scale"]').fill("90");
  await page.locator('.mint-editor [name="positionX"]').fill("42");
  await page.locator('.mint-editor [name="positionY"]').fill("57");
  await page.locator('.mint-editor [data-apply]').click();
  const rendered=await media.locator("img").evaluate(image=>({fit:image.style.objectFit,position:image.style.objectPosition,transform:image.style.transform}));
  assert.deepEqual(rendered,{fit:"contain",position:"42% 57%",transform:"scale(0.9)"});
  const bitmapBytes=await page.evaluate(async()=>{const capture=await window.mintPdfExport.renderSceneToBitmap(document.querySelector('.mint-scene'));return capture.jpeg.length});
  assert.ok(bitmapBytes>12000,"本地PDF位图必须包含编辑后的图片和页面内容");
  await page.evaluate(()=>{window.showSaveFilePicker=async()=>({name:"section-current.mint-section.html",createWritable:async()=>({write:async blob=>{window.__saved=await blob.text()},close:async()=>{}})})});
  await page.locator('[data-save-workfile]').click();
  await page.waitForFunction(()=>typeof window.__saved==="string");
  const saved=path.join(os.tmpdir(),`mint-media-${Date.now()}.mint-section.html`),unpacked=path.join(os.tmpdir(),`mint-media-unpacked-${Date.now()}`);
  fs.writeFileSync(saved,await page.evaluate(()=>window.__saved));
  const unpack=spawnSync(process.execPath,[path.join(root,"scripts/collaboration-package.mjs"),"unpack",saved,unpacked],{encoding:"utf8",maxBuffer:20_000_000});
  assert.equal(unpack.status,0,unpack.stderr||unpack.stdout);
  const model=JSON.parse(fs.readFileSync(path.join(unpacked,"report-model.json"),"utf8")),stored=Object.values(model.media)[0];
  assert.equal(stored.fit,"contain");assert.equal(stored.scale,0.9);assert.equal(stored.positionX,42);assert.equal(stored.positionY,57);
  await page.goto(pathToFileURL(saved).href,{waitUntil:"load"});
  const reopened=await page.locator('[data-edit-kind="media"] img').first().evaluate(image=>({fit:image.style.objectFit,position:image.style.objectPosition,transform:image.style.transform}));
  assert.deepEqual(reopened,rendered);
  console.log(JSON.stringify({passed:true,editable:true,persisted:true,reopened:true,localPdfBitmap:true}));
}finally{await browser.close()}
