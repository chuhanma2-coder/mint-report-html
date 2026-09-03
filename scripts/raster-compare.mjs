import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

function sharpModule() {
  if (!process.env.RUNTIME_NODE_MODULES) throw new Error("RUNTIME_NODE_MODULES is required for artifact visual verification");
  const require = createRequire(path.join(process.env.RUNTIME_NODE_MODULES, "package.json"));
  return import(pathToFileURL(require.resolve("sharp")).href);
}

const distance=(a,b)=>Math.abs(a[0]-b[0])+Math.abs(a[1]-b[1])+Math.abs(a[2]-b[2]);

export async function compareRasters(reference, candidate, options={}) {
  const imported=await sharpModule(),sharp=imported.default||imported;
  const width=options.width||192,height=options.height||108;
  const decode=async source=>sharp(source).flatten({background:"#ffffff"}).resize(width,height,{fit:"fill"}).removeAlpha().raw().toBuffer();
  const [a,b]=await Promise.all([decode(reference),decode(candidate)]);
  let absolute=0,foregroundA=0,foregroundB=0,hashA=0n,hashB=0n;
  const backgroundA=[a[0],a[1],a[2]],backgroundB=[b[0],b[1],b[2]],lumA=[],lumB=[];
  for(let index=0;index<a.length;index+=3){absolute+=distance([a[index],a[index+1],a[index+2]],[b[index],b[index+1],b[index+2]]);if(distance([a[index],a[index+1],a[index+2]],backgroundA)>36)foregroundA++;if(distance([b[index],b[index+1],b[index+2]],backgroundB)>36)foregroundB++;lumA.push(.2126*a[index]+.7152*a[index+1]+.0722*a[index+2]);lumB.push(.2126*b[index]+.7152*b[index+1]+.0722*b[index+2])}
  const cells=64,step=Math.floor(lumA.length/cells),means=[lumA.reduce((x,y)=>x+y,0)/lumA.length,lumB.reduce((x,y)=>x+y,0)/lumB.length];
  for(let cell=0;cell<cells;cell++){let av=0,bv=0;for(let i=cell*step;i<Math.min(lumA.length,(cell+1)*step);i++){av+=lumA[i];bv+=lumB[i]}if(av/step>=means[0])hashA|=1n<<BigInt(cell);if(bv/step>=means[1])hashB|=1n<<BigInt(cell)}
  let xor=hashA^hashB,hamming=0;while(xor){hamming+=Number(xor&1n);xor>>=1n}
  const pixels=width*height,similarity=1-absolute/(pixels*3*255),coverageReference=foregroundA/pixels,coverageCandidate=foregroundB/pixels,coverageDrop=Math.max(0,coverageReference-coverageCandidate);
  return {similarity,perceptualHashDistance:hamming,coverageReference,coverageCandidate,coverageDrop,passed:similarity>=(options.minSimilarity??.9)&&hamming<=(options.maxHashDistance??14)&&coverageDrop<=(options.maxCoverageDrop??.08)};
}
