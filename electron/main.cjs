const { app, BrowserWindow, globalShortcut, ipcMain, clipboard, nativeImage, safeStorage, shell, Tray, Menu, protocol, net } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const { pathToFileURL } = require('node:url');
const crypto = require('node:crypto');
const sharp = require('sharp');
const { Library, readJSON, atomicJSON, downloadImage, searchImages } = require('./core.cjs');
require('dotenv').config({ path: path.join(app.isPackaged ? path.dirname(process.execPath) : path.join(__dirname, '..'), '.env'), quiet: true });
if (process.env.SPRINT_TEST_DATA) app.setPath('userData', process.env.SPRINT_TEST_DATA);
protocol.registerSchemesAsPrivileged([{ scheme: 'sprint', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
let win, tray, library, prefs = {}, quitting = false, shortcutRegistered = false, rendererReady;
const rendererReadyPromise = new Promise(resolve => { rendererReady = resolve; });
const images = new Map(), buffers = new Map(), inflightImages = new Map(), searches = new Map(), cache = new Map();
const shortcut = 'CommandOrControl+Alt+Space';
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
function apiKey() {
  if (prefs.key && safeStorage.isEncryptionAvailable()) { try { return safeStorage.decryptString(Buffer.from(prefs.key, 'base64')); } catch {} }
  return process.env.SERPAPI_API_KEY || '';
}
function settings() { return { hasKey: !!apiKey(), shortcut: process.platform === 'darwin' ? '⌘⌥Space' : 'Ctrl+Alt+Space', shortcutRegistered, launchAtLogin: !!prefs.launchAtLogin, downloadsPath: app.getPath('downloads'), encryptedStorage: safeStorage.isEncryptionAvailable() }; }
function record(id) { const image = images.get(id) || library.list().find(i => i.id === id); if (!image) throw new Error('Image is no longer available. Search again.'); return image; }
function remember(id, data) { buffers.delete(id); buffers.set(id, data); while (buffers.size > 12) buffers.delete(buffers.keys().next().value); return data; }
async function pngFor(id) {
  if (buffers.has(id)) return buffers.get(id);
  if (inflightImages.has(id)) return inflightImages.get(id);
  const operation = (async () => {
    const img = record(id);
    let input;
    if (img.saved) input = await fs.readFile(library.imagePath(id));
    else if (img.cutoutPath) input = await fs.readFile(img.cutoutPath);
    else input = await downloadImage(img.url);
    const data = await sharp(input, { limitInputPixels: 40000000, animated: false }).rotate().png().toBuffer();
    return remember(id, data);
  })();
  inflightImages.set(id, operation);
  try { return await operation; } finally { inflightImages.delete(id); }
}
function handler(name, fn) {
  ipcMain.handle(name, async (event, payload) => {
    if (event.sender !== win?.webContents || event.senderFrame !== win.webContents.mainFrame) return { ok: false, error: 'Untrusted request.' };
    try { return { ok: true, value: await fn(payload) }; }
    catch(e) { let message = e.message || 'Something went wrong. Try again.'; const key = apiKey(); if(key) message = message.split(key).join('[redacted]'); return { ok: false, error: message.slice(0,400) }; }
  });
}
function show() { if(win.isMinimized()) win.restore(); win.show(); win.focus(); win.webContents.send('focus-search'); }
function createWindow() {
  win = new BrowserWindow({ width: 960, height: 690, minWidth: 660, minHeight: 480, frame: false, backgroundColor: '#171716', show: false, autoHideMenuBar: true, title: 'Image Sprint', webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false, webSecurity: true } });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.webContents.session.setPermissionRequestHandler((_wc,_p,cb) => cb(false));
  win.webContents.session.setPermissionCheckHandler(() => false);
  win.on('close', e => { if (!quitting) { e.preventDefault(); win.hide(); } });
  win.loadURL('sprint://app/index.html');
  win.once('ready-to-show', () => { if (!process.argv.includes('--hidden') && !process.argv.includes('--smoke-test')) show(); });
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if(win) show(); });
  app.whenReady().then(async () => {
    const root = app.getPath('userData');
    library = new Library(root, app.getPath('downloads')); await library.init();
    prefs = await readJSON(settingsFile(), {});
    await fs.mkdir(path.join(root, 'cutouts'), { recursive: true });
    protocol.handle('sprint', request => {
      try {
        const u = new URL(request.url);
        if (u.hostname === 'library') return net.fetch(pathToFileURL(library.imagePath(u.pathname.slice(1))).href);
        if (u.hostname !== 'app') throw new Error();
        const dist = path.resolve(__dirname, '../dist');
        const file = path.resolve(dist, '.' + decodeURIComponent(u.pathname));
        if (!file.startsWith(dist + path.sep)) throw new Error();
        return net.fetch(pathToFileURL(file).href);
      }
      catch { return new Response('Not found', { status: 404 }); }
    });
    shortcutRegistered = globalShortcut.register(shortcut, () => win.isVisible() && win.isFocused() ? win.hide() : show());
    const traySVG = Buffer.from('<svg width="32" height="32" xmlns="http://www.w3.org/2000/svg"><rect width="32" height="32" rx="8" fill="#ded5fd"/><path d="M18 5 8 18h7l-1 9 10-14h-7z" fill="#29252f"/></svg>');
    const icon = nativeImage.createFromBuffer(await sharp(traySVG).png().toBuffer());
    tray = new Tray(icon); tray.setToolTip('Image Sprint · Ctrl+Alt+Space');
    tray.setContextMenu(Menu.buildFromTemplate([{ label:'Open Image Sprint', click: show }, { label:'Downloads', click: () => shell.openPath(app.getPath('downloads')) }, { type:'separator' }, { label:'Quit', click: () => { quitting = true; app.quit(); } }]));
    tray.on('click', show);
    handler('settings:get', settings);
    handler('settings:set', async (value) => {
      if (!value || typeof value !== 'object') throw new Error('Invalid settings.');
      const next = { ...prefs };
      if (typeof value.key === 'string' && value.key.trim()) {
        if (!safeStorage.isEncryptionAvailable()) throw new Error('OS encryption is unavailable. Use SERPAPI_API_KEY in a local .env file.');
        if(value.key.trim().length < 20 || value.key.length > 300) throw new Error('This does not look like a SerpAPI key.');
        next.key = safeStorage.encryptString(value.key.trim()).toString('base64'); cache.clear();
      }
      if(typeof value.launchAtLogin === 'boolean') next.launchAtLogin = value.launchAtLogin;
      await atomicJSON(settingsFile(), next); prefs = next;
      if(typeof value.launchAtLogin === 'boolean') app.setLoginItemSettings({ openAtLogin: next.launchAtLogin, path: process.env.PORTABLE_EXECUTABLE_FILE || process.execPath, args: app.isPackaged ? ['--hidden'] : [app.getAppPath(), '--hidden'] });
      return settings();
    });
    handler('images:search', async (p) => {
      if (!p || typeof p.requestId !== 'string' || p.requestId.length > 100) throw new Error('Invalid search.');
      const key = JSON.stringify([p.query,p.filter,p.page]); const previous = cache.get(key);
      if(previous && Date.now() - previous.time < 300000) return previous.result;
      const controller = new AbortController(); searches.get(p.requestId)?.abort(); searches.set(p.requestId,controller);
      try {
        const result = await searchImages({ ...p, key: apiKey(), signal: controller.signal });
        result.images.forEach(i => images.set(i.id,i));
        cache.set(key, { time: Date.now(), result }); while(cache.size > 30) cache.delete(cache.keys().next().value);
        return result;
      } finally { if(searches.get(p.requestId) === controller) searches.delete(p.requestId); }
    });
    handler('images:cancel', (id) => { searches.get(id)?.abort(); });
    handler('images:read', async (id) => new Uint8Array(await pngFor(id)));
    handler('images:cutout', async ({ id, bytes }) => {
      const original = record(id);
      if (!(bytes instanceof Uint8Array) || bytes.length > 30 * 1024 * 1024) throw new Error('Invalid cutout image.');
      const png = await sharp(Buffer.from(bytes), { limitInputPixels: 40000000 }).png().toBuffer();
      const image = { ...original, id: crypto.randomUUID(), saved: false, cutout: true };
      image.cutoutPath = path.join(root, 'cutouts', `${image.id}.png`);
      await fs.writeFile(image.cutoutPath, png); images.set(image.id,image); remember(image.id,png);
      return { id: image.id, cutout: true };
    });
    handler('images:act', async ({ id, action }) => {
      if (!['save','copy'].includes(action)) throw new Error('Unsupported image action.');
      const image = record(id), png = await pngFor(id);
      const result = await library.persist(image,png,action);
      if (action === 'copy') clipboard.writeImage(nativeImage.createFromBuffer(png));
      return result;
    });
    handler('library:list', () => library.list());
    handler('downloads:open', async () => { const error = await shell.openPath(app.getPath('downloads')); if(error) throw new Error(error); });
    handler('source:open', async (id) => { const image = record(id); const url = new URL(image.sourceUrl); if (!['http:','https:'].includes(url.protocol)) throw new Error('Unsupported link.'); await shell.openExternal(url.href); });
    handler('window:hide', () => win.hide());
    handler('renderer:ready', () => rendererReady());
    createWindow();
    if(process.argv.includes('--smoke-test')) {
      await Promise.race([rendererReadyPromise, new Promise((_,reject) => setTimeout(() => reject(new Error('Renderer did not initialize in 20 seconds.')),20000))]);
      const result = { windowLoaded: true, rendererInitialized: true, shortcutRegistered, encryptedStorage: safeStorage.isEncryptionAvailable(), libraryCount: library.list().length, hasKey: !!apiKey() };
      if(process.env.SPRINT_SMOKE_QUERY && apiKey()) {
        const found = await searchImages({ query: process.env.SPRINT_SMOKE_QUERY, key: apiKey() }); result.liveImageCount = found.images.length;
        if(found.images[0]) { const img = found.images[0]; images.set(img.id,img); const png = await pngFor(img.id); result.decodedImageBytes = png.length; }
      }
      console.log('SPRINT_SMOKE',JSON.stringify(result)); quitting = true; app.quit();
    }
  }).catch(e => { console.error('Image Sprint startup failed:', e.message); quitting = true; app.quit(); });
  app.on('before-quit', () => { quitting = true; });
  app.on('will-quit', () => globalShortcut.unregisterAll());
  app.on('activate', () => { if(win) show(); });
}
