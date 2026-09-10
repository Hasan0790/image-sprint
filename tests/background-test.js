import { cutout } from '../src/background.js';
const canvas=document.querySelector('canvas'),ctx=canvas.getContext('2d');
ctx.fillStyle='#ddd';ctx.fillRect(0,0,256,256);ctx.fillStyle='#df9c21';ctx.beginPath();ctx.ellipse(128,157,74,53,0,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(162,93,37,0,Math.PI*2);ctx.fill();ctx.fillStyle='#f87923';ctx.beginPath();ctx.moveTo(189,91);ctx.lineTo(229,106);ctx.lineTo(189,113);ctx.fill();ctx.fillStyle='#151515';ctx.beginPath();ctx.arc(169,85,6,0,Math.PI*2);ctx.fill();
let count=0;document.querySelector('#responsive').onclick=()=>document.querySelector('#clicks').textContent=`${++count} clicks`;
document.querySelector('#run').onclick=async()=>{
  const status=document.querySelector('#status');status.textContent='Starting…';
  try{const source=await new Promise(r=>canvas.toBlob(r,'image/png'));const result=await cutout(source,(key,current,total)=>status.textContent=`Loading ${key}: ${current}/${total}`);document.querySelector('#output').src=URL.createObjectURL(result);const bitmap=await createImageBitmap(result);const target=new OffscreenCanvas(bitmap.width,bitmap.height);const tc=target.getContext('2d');tc.drawImage(bitmap,0,0);const pixels=tc.getImageData(0,0,bitmap.width,bitmap.height).data;let transparent=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i]<128)transparent++;status.textContent=`PASS: ${result.type}, ${bitmap.width}×${bitmap.height}, ${result.size} bytes, ${transparent} transparent pixels`;}
  catch(e){status.textContent=`FAIL: ${e.message}`;}
};
