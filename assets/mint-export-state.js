// PDF is an on-demand downstream adapter. It never changes the live HTML layout.
(() => {
  const encoder=new TextEncoder();
  const bytes=value=>typeof value==='string'?encoder.encode(value):value;
  const concat=parts=>{const length=parts.reduce((sum,part)=>sum+part.length,0),out=new Uint8Array(length);let offset=0;for(const part of parts){out.set(part,offset);offset+=part.length}return out};
  const decodeBase64=value=>{const binary=atob(value),out=new Uint8Array(binary.length);for(let index=0;index<binary.length;index++)out[index]=binary.charCodeAt(index);return out};
  async function waitForReady() {
    await document.fonts.ready;
    const images=[...document.images];
    await Promise.all(images.map(image=>image.complete&&image.naturalWidth>0?image.decode().catch(()=>{}):image.decode()));
    const failed=images.filter(image=>!image.complete||image.naturalWidth<1),pending=[...document.querySelectorAll('[data-render-ready="false"]')];
    if(failed.length)throw new Error(`有 ${failed.length} 张图片未加载，PDF未生成`);
    if(pending.length)throw new Error(`有 ${pending.length} 个图表或关系图尚未完成渲染`);
  }
  const visible=style=>style.display!=='none'&&style.visibility!=='hidden'&&Number(style.opacity)>0;
  const loadImage=source=>new Promise((resolve,reject)=>{const image=new Image();image.decoding='sync';image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('导出图片无法解码'));image.src=source});
  function roundedRect(context,x,y,width,height,radius){const r=Math.max(0,Math.min(radius,width/2,height/2));context.beginPath();context.roundRect(x,y,width,height,r);}
  function paintBox(context,style,box){
    const radius=parseFloat(style.borderRadius)||0,background=style.backgroundColor;if(background&&!background.endsWith(', 0)')&&background!=='transparent'){roundedRect(context,box.x,box.y,box.width,box.height,radius);context.fillStyle=background;context.fill()}
    const colors=String(style.backgroundImage||'').match(/rgba?\([^)]+\)|#[0-9a-f]{3,8}/ig);if(style.backgroundImage?.startsWith('linear-gradient')&&colors?.length>1){const horizontal=/to right|90deg/.test(style.backgroundImage),gradient=context.createLinearGradient(box.x,box.y,horizontal?box.x+box.width:box.x,horizontal?box.y:box.y+box.height);colors.forEach((color,index)=>gradient.addColorStop(index/(colors.length-1),color));roundedRect(context,box.x,box.y,box.width,box.height,radius);context.fillStyle=gradient;context.fill()}
    const border=Math.max(parseFloat(style.borderTopWidth)||0,parseFloat(style.borderRightWidth)||0,parseFloat(style.borderBottomWidth)||0,parseFloat(style.borderLeftWidth)||0);if(border>0&&style.borderColor!=='transparent'){roundedRect(context,box.x+border/2,box.y+border/2,Math.max(0,box.width-border),Math.max(0,box.height-border),radius);context.strokeStyle=style.borderColor;context.lineWidth=border;context.stroke()}
  }
  function canvasBox(node,stageBox,scaleX,scaleY){const box=node.getBoundingClientRect();return{x:(box.left-stageBox.left)*scaleX,y:(box.top-stageBox.top)*scaleY,width:box.width*scaleX,height:box.height*scaleY}}
  async function paintTextNode(context,node,parent,stageBox,scaleX,scaleY){
    const text=node.textContent||'',style=getComputedStyle(parent);if(!text.trim()||!visible(style))return;const lines=[];let current=null;
    for(let index=0;index<text.length;index++){const range=document.createRange();range.setStart(node,index);range.setEnd(node,index+1);const rect=range.getBoundingClientRect();if(!rect.width&&!rect.height)continue;const top=(rect.top-stageBox.top)*scaleY,left=(rect.left-stageBox.left)*scaleX;if(!current||Math.abs(current.top-top)>2){current={top,left,text:''};lines.push(current)}current.text+=text[index]}
    context.save();context.globalAlpha=Number(style.opacity)||1;context.fillStyle=style.color;context.font=`${style.fontStyle} ${style.fontWeight} ${parseFloat(style.fontSize)}px ${style.fontFamily}`;context.textBaseline='top';for(const line of lines)context.fillText(line.text,line.left,line.top);context.restore();
  }
  async function paintElement(context,node,stageBox,scaleX,scaleY){
    if(!(node instanceof Element)||['SCRIPT','STYLE','NOSCRIPT'].includes(node.tagName))return;const style=getComputedStyle(node);if(!visible(style))return;const box=canvasBox(node,stageBox,scaleX,scaleY);paintBox(context,style,box);
    if(node instanceof HTMLImageElement){await node.decode();const naturalRatio=node.naturalWidth/node.naturalHeight,boxRatio=box.width/box.height,position=String(style.objectPosition||'50% 50%').split(/\s+/),percent=value=>String(value||'50%').endsWith('%')?Math.min(1,Math.max(0,parseFloat(value)/100)):.5,px=percent(position[0]),py=percent(position[1]);let width=box.width,height=box.height;if(style.objectFit==='contain'){if(naturalRatio>boxRatio)height=width/naturalRatio;else width=height*naturalRatio}else if(style.objectFit==='cover'){if(naturalRatio>boxRatio)width=height*naturalRatio;else height=width/naturalRatio}const x=box.x+(box.width-width)*px,y=box.y+(box.height-height)*py,parent=node.parentElement,parentStyle=parent?getComputedStyle(parent):null,clip=parent&&['hidden','clip'].includes(parentStyle?.overflow)?canvasBox(parent,stageBox,scaleX,scaleY):box;context.save();context.beginPath();context.rect(clip.x,clip.y,clip.width,clip.height);context.clip();context.drawImage(node,x,y,width,height);context.restore();return}
    if(node instanceof SVGElement&&node.tagName.toLowerCase()==='svg'){const source=new XMLSerializer().serializeToString(node),image=await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`);context.drawImage(image,box.x,box.y,box.width,box.height);return}
    for(const child of node.childNodes){if(child.nodeType===Node.TEXT_NODE)await paintTextNode(context,child,node,stageBox,scaleX,scaleY);else if(child.nodeType===Node.ELEMENT_NODE)await paintElement(context,child,stageBox,scaleX,scaleY)}
  }
  async function renderSceneToBitmap(scene) {
    const stage=scene.querySelector('.mint-scene__stage');if(!stage)throw new Error(`Scene ${scene.dataset.sceneId||''} 缺少1920×1080画布`);const stageBox=stage.getBoundingClientRect(),scaleX=1920/stageBox.width,scaleY=1080/stageBox.height;
    const canvas=document.createElement('canvas');canvas.width=1920;canvas.height=1080;const context=canvas.getContext('2d',{alpha:false});context.fillStyle=getComputedStyle(stage).backgroundColor||'#fff';context.fillRect(0,0,1920,1080);await paintElement(context,stage,stageBox,scaleX,scaleY);
    const sample=context.getImageData(0,0,1920,1080).data;let changed=0;const first=[sample[0],sample[1],sample[2]];for(let index=0;index<sample.length;index+=4*256)if(Math.abs(sample[index]-first[0])+Math.abs(sample[index+1]-first[1])+Math.abs(sample[index+2]-first[2])>18)changed++;
    const jpeg=decodeBase64(canvas.toDataURL('image/jpeg',.98).split(',')[1]);if(jpeg.length<12000||changed<12)throw new Error(`Scene ${scene.dataset.sceneId||''} 位图接近空白`);return {sceneId:scene.dataset.sceneId||'',width:1920,height:1080,jpeg};
  }
  function assemblePdf(captures) {
    const objects=[],pageIds=[];objects[1]=bytes('<< /Type /Catalog /Pages 2 0 R >>');
    captures.forEach((capture,index)=>{const pageId=3+index*3,imageId=pageId+1,contentId=pageId+2;pageIds.push(`${pageId} 0 R`);const command=bytes('q 1152 0 0 648 0 0 cm /Im0 Do Q');objects[pageId]=bytes(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 1152 648] /Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`);objects[imageId]=concat([bytes(`<< /Type /XObject /Subtype /Image /Width 1920 /Height 1080 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${capture.jpeg.length} >>\nstream\n`),capture.jpeg,bytes('\nendstream')]);objects[contentId]=concat([bytes(`<< /Length ${command.length} >>\nstream\n`),command,bytes('\nendstream')])});
    objects[2]=bytes(`<< /Type /Pages /Count ${captures.length} /Kids [${pageIds.join(' ')}] >>`);
    const parts=[bytes('%PDF-1.4\n%Mint\n')],offsets=[0];let total=parts[0].length;
    for(let id=1;id<objects.length;id++){offsets[id]=total;const object=concat([bytes(`${id} 0 obj\n`),objects[id],bytes('\nendobj\n')]);parts.push(object);total+=object.length}
    const xref=total;let table=`xref\n0 ${objects.length}\n0000000000 65535 f \n`;for(let id=1;id<objects.length;id++)table+=`${String(offsets[id]).padStart(10,'0')} 00000 n \n`;parts.push(bytes(`${table}trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`));return concat(parts);
  }
  function verifyPdf(pdf,captures) {
    const text=new TextDecoder().decode(pdf),pages=(text.match(/\/Type \/Page\b/g)||[]).length;
    if(!text.startsWith('%PDF-1.4')||pages!==captures.length||pdf.length<captures.length*12000)throw new Error('PDF Artifact Gate 未通过');
  }
  async function captureLocalPdf() {
    // Scene Capture Gate: every Scene is ready and nonblank before assembly.
    await waitForReady();const captures=[];
    for(const scene of document.querySelectorAll('.mint-scene'))captures.push(await renderSceneToBitmap(scene));
    if(!captures.length)throw new Error('没有可导出的Scene');const pdf=assemblePdf(captures);verifyPdf(pdf,captures);return new Blob([pdf],{type:'application/pdf'});
  }
  async function captureServicePdf(button,submittedHash) {
    await waitForReady();const response=await fetch('/api/export-pdf',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({html:'<!doctype html>'+document.documentElement.outerHTML,filename:button.dataset.filename||'mint-report.pdf'})});
    if(!response.ok)throw new Error('PDF服务不可用');if(response.headers.get('X-Mint-Content-Hash')!==submittedHash)throw new Error('PDF内容哈希不一致');return response.blob();
  }
  function download(blob,name){const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
  function markCurrent(hash){document.querySelector('meta[name="mint-pdf-state"]')?.setAttribute('content','available');let meta=document.querySelector('meta[name="mint-pdf-content-hash"]');if(!meta){meta=document.createElement('meta');meta.name='mint-pdf-content-hash';document.head.append(meta)}meta.content=hash}
  for(const button of document.querySelectorAll('[data-export-pdf]'))button.addEventListener('click',async()=>{
    const snapshot=window.mintFields.prepareExport();button.disabled=true;const original=button.textContent;button.textContent='正在生成 PDF…';
    try{
      await window.mintFields.flush();const current=window.mintFields.model();if(current.pendingDependencyReviews?.length)throw new Error(`有 ${current.pendingDependencyReviews.length} 条图表关联结论待确认`);
      const hash=document.querySelector('meta[name="mint-content-hash"]')?.content,blob=location.protocol==='file:'?await captureLocalPdf():await captureServicePdf(button,hash);download(blob,button.dataset.filename||'mint-report.pdf');if(document.querySelector('meta[name="mint-content-hash"]')?.content===hash)markCurrent(hash);
    }catch(error){button.title=error.message;button.textContent='PDF生成失败，请检查提示';console.error(error);return}finally{button.disabled=false;window.mintFields.restoreExport(snapshot)}
    button.textContent=original;
  });
  window.mintPdfExport={renderSceneToBitmap,captureLocalPdf};
})();
