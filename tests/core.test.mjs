import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const { titleFor, Library, searchImages, publicURL, isPublicIP }=require('../electron/core.cjs');
test('filenames are safe on Windows and preserve the query',()=>{
  assert.equal(titleFor('monkey'),'Monkey');
  assert.equal(titleFor('../monkey: red?'),'.. monkey red');
  assert.equal(titleFor('CON'),'Image CON');
  assert.equal(titleFor('  ... '),'Image');
  assert.equal(titleFor('a/b\\c'),'A b c');
});
test('parallel saves are numbered, persistent, and never overwrite Downloads',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'sprint-test-'));
  t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const downloads=path.join(dir,'Downloads');await fs.mkdir(downloads);
  await fs.writeFile(path.join(downloads,'Monkey (1).png'),'existing');
  const lib=new Library(path.join(dir,'library'),downloads);await lib.init();
  const image=n=>({url:`https://example.com/${n}.png`,query:'monkey',title:`Monkey ${n}`,source:'Example',cutout:false});
  const result=await Promise.all([lib.persist(image(1),Buffer.from('first'),'save'),lib.persist(image(2),Buffer.from('second'),'copy')]);
  assert.equal(result[0].entry.name,'Monkey (1)');assert.equal(result[0].downloadName,'Monkey (2).png');
  assert.equal(result[1].entry.name,'Monkey (2)');assert.equal(result[1].downloadPath,undefined);
  assert.equal(await fs.readFile(path.join(downloads,'Monkey (1).png'),'utf8'),'existing');
  const restored=new Library(path.join(dir,'library'),downloads);await restored.init();assert.equal(restored.list().length,2);
  const copiedAgain=await restored.persist(image(1),Buffer.from('first'),'copy');assert.equal(copiedAgain.entry.name,'Monkey (1)');assert.equal(restored.list().length,2);
  const removed=await restored.persist({...image(1),cutout:true},Buffer.from('cutout'),'copy');assert.equal(removed.entry.name,'Monkey (3)');
  assert.throws(()=>restored.imagePath('../../secrets'));
});
test('search sends a real Google Images SerpAPI request and normalizes results',async()=>{
  const response=await searchImages({query:'monkey',filter:'transparent',page:2,key:'test-secret'},async url=>{
    assert.equal(url.origin,'https://serpapi.com');assert.equal(url.searchParams.get('api_key'),'test-secret');assert.equal(url.searchParams.get('engine'),'google_images');assert.equal(url.searchParams.get('tbs'),'ic:trans');assert.equal(url.searchParams.get('ijn'),'2');
    return Response.json({images_results:[{title:'Monkey',original:'https://example.com/m.png',thumbnail:'https://example.com/t.png',source:'Example',original_width:800,original_height:600},{original:'file:///private'}]});
  });
  assert.equal(response.images.length,1);assert.equal(response.images[0].query,'monkey');assert.equal(response.images[0].width,800);
});
test('search reports missing/invalid keys, quota, cancellation, and empty responses',async()=>{
  await assert.rejects(searchImages({query:'monkey'}),/Settings/);
  await assert.rejects(searchImages({query:'monkey',key:'secret'},async()=>new Response('',{status:401})),/rejected/);
  await assert.rejects(searchImages({query:'monkey',key:'secret'},async()=>new Response('',{status:429})),/quota/);
  const empty=await searchImages({query:'monkey',key:'secret'},async()=>Response.json({error:"Google hasn't returned any results for this query."}));assert.deepEqual(empty,{images:[],hasMore:false});
  await assert.rejects(searchImages({query:'monkey',key:'secret'},async()=>Response.json({error:'bad secret'})),/bad \[redacted\]/);
  const controller=new AbortController();controller.abort();await assert.rejects(searchImages({query:'monkey',key:'secret',signal:controller.signal},async()=>{throw new Error('fetch');}),/cancelled/);
});
test('image URLs cannot address local services or files',async()=>{
  for(const ip of ['127.0.0.1','10.0.0.1','192.168.1.2','169.254.169.254','172.16.0.1','::1','::ffff:127.0.0.1','fe80::1'])assert.equal(isPublicIP(ip),false,ip);
  assert.equal(isPublicIP('8.8.8.8'),true);
  for(const url of ['file:///C:/secrets','http://127.0.0.1/a','http://[::1]/a','https://example.com:8080/a','https://user:pass@example.com/a'])await assert.rejects(publicURL(url));
});
