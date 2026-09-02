// Save one self-contained work HTML; technical ZIP export remains available for compatibility.
(() => {
  const dataNode = () => document.querySelector('#mint-package-data');
  const modelNode = () => document.querySelector('#mint-creative-data');
  const encoder = new TextEncoder(), decoder = new TextDecoder();
  let payload = null, entryBase64 = new Map(), fileHandle = null, dirty = false, saving = false;
  const crcTable = (() => { const out = new Uint32Array(256); for (let n=0;n<256;n+=1){let c=n;for(let k=0;k<8;k+=1)c=(c&1)?0xedb88320^(c>>>1):c>>>1;out[n]=c>>>0}return out })();
  const crc32 = bytes => { let c=0xffffffff; for (const byte of bytes) c=crcTable[(c^byte)&255]^(c>>>8); return (c^0xffffffff)>>>0 };
  const u16 = (view,offset,value) => view.setUint16(offset,value,true), u32 = (view,offset,value) => view.setUint32(offset,value>>>0,true);
  const decode = value => Uint8Array.from(atob(value), char => char.charCodeAt(0));
  const encode = bytes => { let text=''; for(let index=0;index<bytes.length;index+=0x8000) text += String.fromCharCode(...bytes.subarray(index,index+0x8000)); return btoa(text) };
  const sha256 = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(value=>value.toString(16).padStart(2,'0')).join('');
  function zip(entries) {
    const local=[], central=[]; let offset=0;
    for (const entry of entries) {
      const name=encoder.encode(entry.name), bytes=entry.bytes, crc=crc32(bytes);
      const lh=new Uint8Array(30), lv=new DataView(lh.buffer); u32(lv,0,0x04034b50);u16(lv,4,20);u16(lv,6,0x0800);u16(lv,8,0);u16(lv,10,0);u16(lv,12,0x21);u32(lv,14,crc);u32(lv,18,bytes.length);u32(lv,22,bytes.length);u16(lv,26,name.length);u16(lv,28,0);local.push(lh,name,bytes);
      const ch=new Uint8Array(46), cv=new DataView(ch.buffer);u32(cv,0,0x02014b50);u16(cv,4,20);u16(cv,6,20);u16(cv,8,0x0800);u16(cv,10,0);u16(cv,12,0);u16(cv,14,0x21);u32(cv,16,crc);u32(cv,20,bytes.length);u32(cv,24,bytes.length);u16(cv,28,name.length);u32(cv,42,offset);central.push(ch,name);offset+=30+name.length+bytes.length;
    }
    const centralSize=central.reduce((sum,item)=>sum+item.length,0), end=new Uint8Array(22), ev=new DataView(end.buffer);u32(ev,0,0x06054b50);u16(ev,8,entries.length);u16(ev,10,entries.length);u32(ev,12,centralSize);u32(ev,16,offset);return new Blob([...local,...central,end],{type:'application/zip'});
  }
  function setDirty(value=true){dirty=value;document.body.classList.toggle('mint-workfile-dirty',dirty);document.querySelectorAll('[data-save-workfile]').forEach(button=>button.textContent=dirty?'保存当前版 *':'保存当前版')}
  async function refreshPackage() {
    await window.mintFields?.flush?.();
    const model=JSON.parse(modelNode().textContent);model.userEdits||=[];model.updatedAt=new Date().toISOString();
    const modelBytes=encoder.encode(JSON.stringify(model,null,2)+'\n'),modelHash=await sha256(modelBytes);
    const manifest=JSON.parse(decoder.decode(decode(entryBase64.get('mint-package.json')))),previous=manifest.contentHash;
    if(previous!==modelHash){manifest.lineage=[...new Set([...(manifest.lineage||[]),previous].filter(Boolean))];manifest.parentContentHash=previous||null;manifest.contentHash=modelHash;manifest.revision=Number(manifest.revision||0)+1}
    manifest.updatedAt=model.updatedAt;manifest.files={...(manifest.files||{}),'report-model.json':modelHash};
    entryBase64.set('report-model.json',encode(modelBytes));entryBase64.set('mint-package.json',encode(encoder.encode(JSON.stringify(manifest,null,2)+'\n')));
    payload={...payload,entries:[...entryBase64].map(([name,base64])=>({name,base64}))};dataNode().textContent=JSON.stringify(payload);return {manifest,modelHash};
  }
  async function buildWorkfileHtml(){const wasEditing=document.body.classList.contains('editing');window.mintCreative?.setEditing(false);await refreshPackage();const html='<!doctype html>\n'+document.documentElement.outerHTML;if(wasEditing)window.mintCreative?.setEditing(true);return html}
  function download(blob,name){const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),2000)}
  async function saveWorkfile(){if(saving)return;saving=true;try{const html=await buildWorkfileHtml();if(window.showSaveFilePicker){if(!fileHandle)fileHandle=await window.showSaveFilePicker({suggestedName:payload.downloadName,types:[{description:'Mint 可编辑工作文件',accept:{'text/html':['.html']}}]});const writable=await fileHandle.createWritable();await writable.write(new Blob([html],{type:'text/html;charset=utf-8'}));await writable.close();setDirty(false);return {mode:'direct',name:fileHandle.name}}download(new Blob([html],{type:'text/html;charset=utf-8'}),payload.downloadName);setDirty(false);return {mode:'download',name:payload.downloadName}}catch(error){if(error?.name!=='AbortError')throw error;return {mode:'cancelled'}}finally{saving=false}}
  async function savePackage(){await refreshPackage();const entries=[...entryBase64].map(([name,base64])=>({name,bytes:decode(base64)}));download(zip(entries),payload.packageDownloadName||'mint-workfile.zip')}
  function init(){const node=dataNode();if(!node){document.querySelectorAll('[data-save-workfile],[data-export-package]').forEach(button=>button.hidden=true);return}payload=JSON.parse(node.textContent);entryBase64=new Map(payload.entries.map(entry=>[entry.name,entry.base64]));document.querySelectorAll('[data-save-workfile]').forEach(button=>{button.hidden=false;button.addEventListener('click',saveWorkfile)});document.querySelectorAll('[data-export-package]').forEach(button=>button.addEventListener('click',savePackage));addEventListener('mint-field-change',()=>setDirty(true));addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue=''}});addEventListener('keydown',event=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='s'){event.preventDefault();saveWorkfile()}});window.mintPackageExport={saveWorkfile,savePackage,buildWorkfileHtml,refreshPackage,setDirty,getState:()=>({dirty,revision:JSON.parse(decoder.decode(decode(entryBase64.get('mint-package.json')))).revision})}}
  init();
})();
