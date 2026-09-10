import test from 'node:test';
import assert from 'node:assert/strict';
import { SearchTabs } from '../src/state.js';
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
test('two searches load concurrently without changing the selected tab',async()=>{
  const calls=[];const tabs=new SearchTabs({search:p=>{const d=deferred();calls.push({p,...d});return d.promise;},cancelSearch:async()=>{}});
  const first=tabs.current;const a=tabs.search(first.id,'monkey');const second=tabs.add();const b=tabs.search(second.id,'icons');
  assert.equal(first.loading,true);assert.equal(second.loading,true);assert.equal(calls.length,2);
  calls[1].resolve({images:[{id:'icon',url:'icon'}],hasMore:true});await b;
  calls[0].resolve({images:[{id:'monkey',url:'monkey'}],hasMore:true});await a;
  assert.equal(tabs.active,second.id);assert.equal(first.images[0].id,'monkey');assert.equal(second.images[0].id,'icon');
});
test('stale requests cannot replace a newer search',async()=>{
  const calls=[];const tabs=new SearchTabs({search:()=>{const d=deferred();calls.push(d);return d.promise;},cancelSearch:async()=>{}});
  const id=tabs.active;const old=tabs.search(id,'old');const fresh=tabs.search(id,'new');
  calls[1].resolve({images:[{id:'new',url:'new'}],hasMore:false});await fresh;
  calls[0].resolve({images:[{id:'old',url:'old'}],hasMore:false});await old;
  assert.equal(tabs.current.query,'new');assert.equal(tabs.current.images[0].id,'new');
});
test('closing a loading tab cancels it and never resurrects it',async()=>{
  const d=deferred(),cancelled=[];const tabs=new SearchTabs({search:()=>d.promise,cancelSearch:async id=>cancelled.push(id)});
  const id=tabs.active;const pending=tabs.search(id,'monkey');tabs.close(id);
  assert.equal(cancelled.length,1);assert.equal(tabs.tabs.length,1);assert.notEqual(tabs.active,id);
  d.resolve({images:[{id:'old',url:'old'}],hasMore:true});await pending;assert.equal(tabs.current.images.length,0);
});
test('pagination deduplicates images and keeps existing results on failure',async()=>{
  let count=0;const tabs=new SearchTabs({search:async()=>{if(++count===3)throw new Error('quota');return {images:count===1?[{id:'a',url:'a'}]:[{id:'a2',url:'a'},{id:'b',url:'b'}],hasMore:true};},cancelSearch:async()=>{}});
  await tabs.search(tabs.active,'monkey');await tabs.search(tabs.active,'monkey','all',true);assert.equal(tabs.current.images.length,2);
  await tabs.search(tabs.active,'monkey','all',true);assert.equal(tabs.current.images.length,2);assert.equal(tabs.current.error,'quota');assert.equal(tabs.current.page,1);
});
