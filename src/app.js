import './style.css';
import { createIcons, Search, Plus, X, Bookmark, Settings2, ArrowUpRight, ArrowDownToLine, Copy, WandSparkles, Image, Zap, ArrowRight, FolderOpen, Check, LoaderCircle, SlidersHorizontal, Scan, Command, Sparkles, ChevronRight, ExternalLink } from 'lucide';
import { SearchTabs } from './state.js';
import { cutout as createCutout } from './background.js';
const icons = { Search, Plus, X, Bookmark, Settings2, ArrowUpRight, ArrowDownToLine, Copy, WandSparkles, Image, Zap, ArrowRight, FolderOpen, Check, LoaderCircle, SlidersHorizontal, Scan, Command, Sparkles, ChevronRight, ExternalLink };
const icon = name => `<i data-lucide="${name}"></i>`;
const esc = value => String(value ?? '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
const $ = s => document.querySelector(s);
const previewError = async () => { throw new Error('Open the desktop app to use SerpAPI, your clipboard, and Downloads.'); };
const api = window.sprint || { desktop:false, settings:async()=>({hasKey:false,shortcut:'Ctrl+Alt+Space',shortcutRegistered:false}), library:async()=>[], search:previewError, cancelSearch:async()=>{}, configure:previewError, downloads:previewError, image:previewError, act:previewError, registerCutout:previewError, source:previewError, hide:async()=>{} };
let config = {}, saved = [], savedFilter = '', toastTimer, selected = null, queue = Promise.resolve(), modelReady = false, lastFocus;
const jobs = new Map(), objectURLs = new Set();
const tabs = new SearchTabs(api);
$('#app').innerHTML = `
  <header class="titlebar"><div class="wordmark"><span class="brand-icon">${icon('zap')}</span>image sprint<span class="beta">DESKTOP</span></div><div class="window-tools"><button class="icon-button" id="settings" title="Settings · Ctrl+," aria-label="Settings">${icon('settings-2')}</button><span class="title-separator"></span><button class="icon-button" id="hide" title="Hide · Esc" aria-label="Hide window">${icon('x')}</button></div></header>
  <nav class="tabbar" aria-label="Image workspaces"><div id="search-tabs" role="tablist" aria-label="Search tabs"></div><button id="new-tab" class="new-tab icon-button" title="New search · Ctrl+T" aria-label="New search tab">${icon('plus')}</button><div class="tab-spacer"></div><button id="saved-tab" class="saved-tab" role="tab" aria-selected="false">${icon('bookmark')} Saved <span id="saved-count">0</span></button></nav>
  <form class="searchbar" id="search-form"><span class="search-icon">${icon('search')}</span><input id="query" aria-label="Search Google Images" autocomplete="off" spellcheck="false" placeholder="Find an image. Keep your flow." autofocus /><button class="search-submit" type="submit" title="Search · Enter">${icon('arrow-right')}<kbd>↵</kbd></button></form>
  <section class="toolbar"><div id="filters" class="filters" aria-label="Image filters"><button data-filter="all" class="active">All images</button><button data-filter="transparent">${icon('scan')} Transparent</button><button data-filter="icons">${icon('sparkles')} Icons</button><button data-filter="photos">Photos</button></div><span class="provider" id="provider"><span class="google-g">G</span> Google Images</span></section>
  <main id="content" aria-live="polite"></main>
  <footer><div class="footer-left"><span class="status-dot"></span><span id="status">Ready when you are</span></div><div class="footer-keys"><span><kbd>Ctrl</kbd><kbd>T</kbd> new tab</span><span><kbd>↵</kbd> search</span><button id="downloads" title="Open Downloads folder">${icon('folder-open')}</button></div></footer>
  <div class="toast" id="toast" role="status"></div><dialog id="settings-dialog"></dialog><dialog id="preview-dialog"></dialog>`;
function redrawIcons() { createIcons({ icons, attrs:{ 'stroke-width':1.6, width:16, height:16 } }); }
function focusSearch() { $('#query').focus(); $('#query').select(); }
function notify(message, error = false) { clearTimeout(toastTimer); $('#toast').textContent=message; $('#toast').className=`toast visible ${error?'error':''}`; toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),error?7000:3800); }
function activate(id) { tabs.active=id; render(); focusSearch(); }
function renderTabs() {
  $('#search-tabs').innerHTML=tabs.tabs.map((t,n)=>`<div class="tab ${tabs.active===t.id?'active':''}"><button role="tab" aria-selected="${tabs.active===t.id}" data-tab="${t.id}" title="${esc(t.query||'New search')}">${icon(t.loading?'loader-circle':'search')}<span>${esc(t.query||'New search')}</span></button><button class="tab-close" data-close="${t.id}" title="Close tab" aria-label="Close ${esc(t.query||`search ${n+1}`)}">${icon('x')}</button></div>`).join('');
  $('#saved-tab').classList.toggle('active',tabs.active==='saved'); $('#saved-tab').setAttribute('aria-selected',String(tabs.active==='saved')); $('#saved-count').textContent=saved.length;
}
function emptyMarkup(isSaved=false) {
  if(isSaved) return `<div class="empty saved-empty"><div class="empty-emblem">${icon('bookmark')}</div><h1>Your next favorite lives here.</h1><p>Copy or save an image and it’s kept here automatically.<br>Named after your search. Ready to use again.</p><button class="primary" data-start>Find your first image ${icon('arrow-right')}</button></div>`;
  return `<div class="empty"><div class="empty-art" aria-hidden="true"><div class="art-card art-back">${icon('image')}</div><div class="art-card art-main"><svg viewBox="0 0 100 76" fill="none"><circle cx="72" cy="22" r="8" fill="currentColor" opacity=".65"/><path d="m4 69 29-34 19 23 14-16 29 27" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/></svg><span class="art-spark">${icon('zap')}</span></div><span class="art-corner corner-one"></span><span class="art-corner corner-two"></span></div><div class="eyebrow">LESS HUNTING. MORE MAKING.</div><h1>Ideas move fast.<br><span>Your images should, too.</span></h1><p>Search, copy, cut out. Back to creating.</p><div class="suggestions"><button data-suggestion="chrome 3d icons">Chrome icons ${icon('arrow-up-right')}</button><button data-suggestion="monkey">Monkey ${icon('arrow-up-right')}</button><button data-suggestion="paper texture">Paper textures ${icon('arrow-up-right')}</button></div>${!config.hasKey?`<button class="connect-hint" data-settings>${icon('zap')} Connect SerpAPI to make your first search ${icon('chevron-right')}</button>`:`<div class="empty-shortcut">Always one shortcut away <kbd>${esc(config.shortcut||'Ctrl+Alt+Space')}</kbd></div>`}</div>`;
}
function cardMarkup(i,index) {
  const job=jobs.get(i.id); const title=i.saved?i.name:i.title;
  return `<article class="image-card ${i.cutout?'is-cutout':''}" data-card="${i.id}"><button class="image-open" data-preview="${i.id}" aria-label="Preview ${esc(title)}" data-index="${index}"><img src="${esc(i.thumbnail)}" alt="${esc(title)}" loading="lazy" referrerpolicy="no-referrer" /><span class="image-missing">Preview unavailable</span></button>${i.cutout?`<span class="cutout-badge">${icon('check')} Cutout</span>`:''}<span class="dimensions">${i.width&&i.height?`${i.width} × ${i.height}`:''}</span><div class="card-actions"><button data-action="copy" data-id="${i.id}" title="Copy image" aria-label="Copy ${esc(title)}" ${job?'disabled':''}>${icon('copy')}<span>Copy</span></button><button data-action="save" data-id="${i.id}" title="Save to Downloads" aria-label="Save ${esc(title)}" ${job?'disabled':''}>${icon('arrow-down-to-line')}</button><button data-action="cutout" data-id="${i.id}" title="Remove background" aria-label="Remove background from ${esc(title)}" ${job||i.cutout?'disabled':''}>${icon('wand-sparkles')}</button></div>${job?`<div class="job-status">${icon('loader-circle')}<span>${esc(job)}</span></div>`:''}<div class="card-caption"><span title="${esc(title)}">${esc(title)}</span><small>${esc(i.source)}</small></div></article>`;
}
function renderContent() {
  const t=tabs.current, isSaved=tabs.active==='saved';
  $('#query').placeholder=isSaved?'Find something in your saved images…':'Find an image. Keep your flow.';
  $('#query').setAttribute('aria-label',isSaved?'Search saved images':'Search Google Images');
  const draft=isSaved?savedFilter:t?.draft||''; if($('#query').value!==draft) $('#query').value=draft;
  $('#filters').hidden=isSaved; $('#provider').innerHTML=isSaved?`${icon('bookmark')} Your local library`:'<span class="google-g">G</span> Google Images';
  document.querySelectorAll('[data-filter]').forEach(b=>{b.classList.toggle('active',b.dataset.filter===t?.filter);b.setAttribute('aria-pressed',String(b.dataset.filter===t?.filter));});
  const busy=tabs.tabs.filter(t=>t.loading).length;
  $('#status').textContent=busy?`${busy} search${busy>1?'es':''} running${jobs.size?' · processing images':''}`:jobs.size?`${jobs.size} image${jobs.size>1?'s':''} processing`:api.desktop?'Ready when you are':'Desktop UI preview';
  if(isSaved&&!saved.length) $('#content').innerHTML=emptyMarkup(true);
  else if(!isSaved&&!t?.query) $('#content').innerHTML=emptyMarkup();
  else {
    const list=isSaved?saved.filter(i=>`${i.name} ${i.query} ${i.title}`.toLowerCase().includes(savedFilter.toLowerCase())):t.images;
    $('#content').innerHTML=`<div class="results-heading"><span>${isSaved?'YOUR COLLECTION':esc(t.query.toUpperCase())} <span class="result-number">${list.length?`${list.length} image${list.length===1?'':'s'}`:''}</span></span><span>${isSaved?'Copied. Saved. Collected.':t.loading?'Searching Google…':'Hover an image for quick actions'}</span></div>${t?.error&&!isSaved?`<div class="inline-error"><span>${esc(t.error)}</span><button data-retry>Retry</button>${!config.hasKey?'<button data-settings>Settings</button>':''}</div>`:''}<div class="image-grid">${list.map(cardMarkup).join('')}${!isSaved&&t.loading?Array.from({length:list.length?4:8},(_,i)=>`<div class="skeleton" style="--delay:${i*60}ms"><div></div><span></span><small></small></div>`).join(''):''}</div>${!list.length&&!(t?.loading&&!isSaved)&&!(!isSaved&&t?.error)?`<div class="no-results">${icon('search')}<h2>No images found</h2><p>${isSaved?'Try another name or search term.':'Try a broader search or a different filter.'}</p></div>`:''}${!isSaved&&t.hasMore?`<button class="load-more" data-more ${t.loading?'disabled':''}>${t.loading?'Loading…':'Load more images'} ${icon('plus')}</button>`:''}`;
  }
  document.querySelectorAll('.image-open img').forEach(img=>img.addEventListener('error',()=>{img.classList.add('failed');},{once:true}));
  redrawIcons();
}
function render() { renderTabs(); renderContent(); }
tabs.changed=()=>{render();};
function findImage(id) { return saved.find(i=>i.id===id)||tabs.tabs.flatMap(t=>t.images).find(i=>i.id===id); }
async function doAction(id,action) {
  if(jobs.has(id)) return;
  const image=findImage(id); if(!image) return;
  if(action==='cutout') { removeBackground(image); return; }
  jobs.set(id,action==='copy'?'Copying…':'Saving…'); renderContent();
  try { const result=await api.act({id,action}); saved=await api.library(); renderTabs(); notify(action==='copy'?`Copied · ${result.entry.name} added to Saved`:`Saved to Downloads · ${result.downloadName}`); }
  catch(e) { notify(e.message,true); }
  finally { jobs.delete(id); renderContent(); }
}
function blobURL(blob) { const url=URL.createObjectURL(blob); objectURLs.add(url); return url; }
function removeBackground(image) {
  jobs.set(image.id,modelReady?'Queued…':'Preparing cutout…'); renderContent();
  queue=queue.catch(()=>{}).then(async()=>{
    try {
      jobs.set(image.id,'Loading original…'); renderContent();
      const bytes=await api.image(image.id);
      jobs.set(image.id,modelReady?'Removing background…':'Downloading model · first use'); renderContent();
      let progressTime=0;
      const blob=await createCutout(new Blob([bytes],{type:'image/png'}),(key,current,total)=>{if(Date.now()-progressTime>750){progressTime=Date.now();jobs.set(image.id,current<total&&total>0?`Downloading model · ${Math.round(current/total*100)}%`:'Removing background…');renderContent();}});
      modelReady=true;
      const cutout=await api.registerCutout({id:image.id,bytes:new Uint8Array(await blob.arrayBuffer())});
      const updated={...image,...cutout,saved:false,thumbnail:blobURL(blob),name:undefined};
      let placed=false;
      for(const tab of tabs.tabs) { const index=tab.images.findIndex(i=>i.id===image.id);if(index>=0){tab.images.splice(index,1,updated);placed=true;} }
      if(!placed) { const tab=tabs.add();Object.assign(tab,{query:image.query,draft:image.query,images:[updated]}); }
      if(selected?.id===image.id){selected=updated;$('#preview-dialog').close();}
      notify('Background removed · ready to copy or save');
    } catch(e) { notify(`Could not remove background. ${e.message}`,true); }
    finally { jobs.delete(image.id);render(); }
  });
}
async function showPreview(id) {
  const image=findImage(id); if(!image) return; selected=image;lastFocus=document.activeElement;
  const dialog=$('#preview-dialog');dialog.innerHTML=`<div class="dialog-title"><div><h2>${esc(image.saved?image.name:image.title)}</h2><p>${esc(image.source)}${image.width?` · ${image.width} × ${image.height}`:''}</p></div><button class="icon-button" data-dismiss aria-label="Close preview">${icon('x')}</button></div><div class="preview-image checker"><img src="${esc(image.thumbnail)}" alt="${esc(image.title)}" /></div><div class="preview-actions"><button class="quiet" data-source="${image.id}">${icon('external-link')} Source</button><div><button class="secondary" data-action="cutout" data-id="${image.id}" ${image.cutout?'disabled':''}>${icon('wand-sparkles')} Remove background</button><button class="secondary" data-action="save" data-id="${image.id}">${icon('arrow-down-to-line')} Save</button><button class="primary" data-action="copy" data-id="${image.id}">${icon('copy')} Copy image</button></div></div>`;
  if(!dialog.open) dialog.showModal();redrawIcons();
  try{const bytes=await api.image(id);if(dialog.open&&selected?.id===id) $('.preview-image img').src=blobURL(new Blob([bytes],{type:'image/png'}));}catch(e){notify(e.message,true);}
}
function showSettings() {
  lastFocus=document.activeElement;
  const dialog=$('#settings-dialog');dialog.innerHTML=`<form id="settings-form"><div class="dialog-title"><div><span class="eyebrow">MAKE IT YOURS</span><h2>A little setup. A lot faster.</h2></div><button type="button" class="icon-button" data-dismiss aria-label="Close settings">${icon('x')}</button></div><div class="settings-body"><label for="api-key">SerpAPI key <span class="key-status ${config.hasKey?'connected':''}">${config.hasKey?'Connected':'Not connected'}</span></label><p>Real Google Images results, straight into your workflow.</p><input id="api-key" type="password" autocomplete="off" spellcheck="false" placeholder="${config.hasKey?'Key saved securely · enter a new key to replace':'Paste your SerpAPI key'}" /><small>Your key is encrypted on this computer. It never goes into the repository.</small><div class="settings-rule"></div><div class="setting-row"><div><strong>Open from anywhere</strong><p>Keep Image Sprint running in your tray.</p></div><kbd>${esc(config.shortcut||'Ctrl+Alt+Space')}</kbd></div>${api.desktop&&!config.shortcutRegistered?'<p class="warning">Shortcut unavailable. Another app may be using it. You can open Image Sprint from its tray icon.</p>':''}<label class="setting-row" for="launch-login"><div><strong>Launch at sign-in</strong><p>Ready before your next idea.</p></div><input id="launch-login" type="checkbox" ${config.launchAtLogin?'checked':''}/></label><div class="settings-rule"></div><div class="setting-row"><div><strong>Background removal</strong><p>Runs locally. The model downloads on first use.</p></div><span class="local-badge">On device</span></div><small class="downloads-path">Downloads: ${esc(config.downloadsPath||'Your Windows Downloads folder')}</small><p class="settings-error" role="alert"></p></div><div class="dialog-footer"><span>${api.desktop?'IMAGE SPRINT / 1.0':'PREVIEW · OPEN THE DESKTOP APP TO CONNECT'}</span><button class="primary" type="submit">Save settings ${icon('check')}</button></div></form>`;dialog.showModal();redrawIcons();$('#api-key').focus();
  $('#settings-form').addEventListener('submit',async e=>{e.preventDefault();const button=e.submitter;button.disabled=true;try{config=await api.configure({key:$('#api-key').value,launchAtLogin:$('#launch-login').checked});$('#api-key').value='';dialog.close();render();notify('Settings saved. You’re ready to search.');focusSearch();}catch(e){$('.settings-error').textContent=e.message;}finally{button.disabled=false;}});
}
$('#search-form').addEventListener('submit',e=>{e.preventDefault();if(tabs.active==='saved'){savedFilter=$('#query').value;renderContent();}else tabs.search(tabs.active,$('#query').value,tabs.current.filter);});
$('#query').addEventListener('input',()=>{if(tabs.active==='saved'){savedFilter=$('#query').value;renderContent();}else if(tabs.current)tabs.current.draft=$('#query').value;});
$('#new-tab').onclick=()=>{tabs.add();focusSearch();};$('#saved-tab').onclick=()=>activate('saved');$('#settings').onclick=showSettings;$('#hide').onclick=()=>api.hide();$('#downloads').onclick=()=>api.downloads().catch(e=>notify(e.message,true));
document.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b||b.disabled)return;
  if(b.dataset.tab)activate(b.dataset.tab);
  if(b.dataset.close){tabs.close(b.dataset.close);focusSearch();}
  if(b.dataset.filter){const t=tabs.current;if(t){t.filter=b.dataset.filter;if(t.query)tabs.search(t.id,t.query,t.filter);else renderContent();}}
  if(b.dataset.suggestion){tabs.search(tabs.active,b.dataset.suggestion,tabs.current.filter);focusSearch();}
  if(b.hasAttribute('data-settings'))showSettings();
  if(b.hasAttribute('data-retry'))tabs.search(tabs.active,tabs.current.query,tabs.current.filter);
  if(b.hasAttribute('data-more'))tabs.search(tabs.active,tabs.current.query,tabs.current.filter,true);
  if(b.hasAttribute('data-start'))activate(tabs.tabs[0].id);
  if(b.dataset.action)doAction(b.dataset.id,b.dataset.action);
  if(b.dataset.preview)showPreview(b.dataset.preview);
  if(b.dataset.source)api.source(b.dataset.source).catch(e=>notify(e.message,true));
  if(b.hasAttribute('data-dismiss'))b.closest('dialog').close();
});
document.querySelectorAll('dialog').forEach(dialog=>{dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});dialog.addEventListener('close',()=>lastFocus?.isConnected?lastFocus.focus():focusSearch());});
document.addEventListener('keydown',e=>{
  const mod=e.ctrlKey||e.metaKey, inDialog=!!$('dialog[open]'), input=['INPUT','TEXTAREA'].includes(e.target.tagName);
  if(e.key==='Escape'&&!inDialog){e.preventDefault();api.hide();}
  if(mod&&e.key===','){e.preventDefault();if(!inDialog)showSettings();return;}
  if(inDialog)return;
  if(mod&&e.key.toLowerCase()==='t'){e.preventDefault();tabs.add();focusSearch();}
  if(mod&&e.key.toLowerCase()==='w'){e.preventDefault();if(tabs.current)tabs.close(tabs.active);else activate(tabs.tabs[0].id);}
  if(mod&&e.key.toLowerCase()==='l'){e.preventDefault();focusSearch();}
  if(mod&&e.key==='Tab'){e.preventDefault();const ids=[...tabs.tabs.map(t=>t.id),'saved'];activate(ids[(ids.indexOf(tabs.active)+(e.shiftKey?ids.length-1:1))%ids.length]);}
  if(mod&&e.key.toLowerCase()==='s'){e.preventDefault();if(!input&&document.activeElement?.closest('[data-card]'))doAction(document.activeElement.closest('[data-card]').dataset.card,'save');else activate('saved');}
  if(mod&&e.key.toLowerCase()==='c'&&!input&&document.activeElement?.closest('[data-card]')){e.preventDefault();doAction(document.activeElement.closest('[data-card]').dataset.card,'copy');}
  if(e.key==='ArrowDown'&&e.target===$('#query')){e.preventDefault();$('.image-open')?.focus();}
  else if(!input&&/^Arrow/.test(e.key)&&document.activeElement?.matches('.image-open')){const cards=[...document.querySelectorAll('.image-open')],idx=cards.indexOf(document.activeElement),cols=getComputedStyle($('.image-grid')).gridTemplateColumns.split(' ').length,delta={ArrowRight:1,ArrowLeft:-1,ArrowDown:cols,ArrowUp:-cols}[e.key];e.preventDefault();cards[Math.max(0,Math.min(cards.length-1,idx+delta))]?.focus();}
});
api.onFocus?.(focusSearch);
window.addEventListener('beforeunload',()=>objectURLs.forEach(url=>URL.revokeObjectURL(url)));
render();
Promise.all([api.settings(),api.library()]).then(([settings,entries])=>{config=settings;saved=entries;render();focusSearch();api.ready?.();}).catch(e=>notify(e.message,true));
