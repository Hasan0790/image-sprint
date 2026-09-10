const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const dns = require('node:dns/promises');
const net = require('node:net');

function titleFor(query) {
  let name = String(query || 'Image').normalize('NFKC').replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').replace(/[. ]+$/g, '').trim().slice(0, 100);
  if (!name) name = 'Image';
  if (/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(name)) name = `Image ${name}`;
  return name.charAt(0).toLocaleUpperCase() + name.slice(1);
}
async function readJSON(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (e) { if (e.code === 'ENOENT') return fallback; throw new Error(`Cannot read ${path.basename(file)}. Your existing data has been preserved.`); }
}
async function atomicJSON(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temp, JSON.stringify(value, null, 2), { mode: 0o600 });
  await fs.rename(temp, file);
}
function isPublicIP(ip) {
  if (net.isIPv4(ip)) {
    const [a,b] = ip.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0)) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19)));
  }
  if (net.isIPv6(ip)) return /^2[0-9a-f]{3}:/i.test(ip);
  return false;
}
async function publicURL(input) {
  const url = new URL(input);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || (url.port && !['80','443'].includes(url.port))) throw new Error('Unsupported image address.');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true });
  if (!addresses.length || addresses.some(a => !isPublicIP(a.address))) throw new Error('Private network image addresses are not supported.');
  return url;
}
async function downloadImage(input, fetcher = fetch) {
  let url = input;
  const signal = AbortSignal.timeout(25000);
  for (let n = 0; n < 5; n++) {
    url = await publicURL(url);
    const res = await fetcher(url, { redirect: 'manual', signal, headers: { Accept: 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8', 'User-Agent': 'ImageSprint/1.0' } });
    if ([301,302,303,307,308].includes(res.status)) {
      const location = res.headers.get('location');
      await res.body?.cancel();
      if (!location) throw new Error('Image host returned an invalid redirect.');
      url = new URL(location, url).href; continue;
    }
    if (!res.ok) { await res.body?.cancel(); throw new Error(`Image host returned ${res.status}. Try another image.`); }
    if (!/^image\//i.test(res.headers.get('content-type') || '')) { await res.body?.cancel(); throw new Error('This source did not return an image. Try another result.'); }
    const max = 30 * 1024 * 1024;
    if (Number(res.headers.get('content-length')) > max) { await res.body?.cancel(); throw new Error('This image exceeds the 30 MB limit.'); }
    let size = 0; const chunks = [];
    for await (const chunk of res.body) { size += chunk.length; if (size > max) { throw new Error('This image exceeds the 30 MB limit.'); } chunks.push(chunk); }
    return Buffer.concat(chunks);
  }
  throw new Error('Image host redirected too many times.');
}
const FILTERS = { all: '', transparent: 'ic:trans', icons: 'itp:clipart,isz:i', photos: 'itp:photo' };
async function searchImages({ query, filter = 'all', page = 0, key, signal }, fetcher = fetch) {
  query = String(query || '').trim().slice(0, 300);
  if (!key) throw new Error('Add your SerpAPI key in Settings to start searching.');
  if (!query) throw new Error('Type something to search.');
  if (!(filter in FILTERS) || !Number.isInteger(page) || page < 0 || page > 100) throw new Error('Invalid search options.');
  const url = new URL('https://serpapi.com/search.json');
  url.search = new URLSearchParams({ engine: 'google_images', q: query, api_key: key, hl: 'en', safe: 'active', ijn: String(page), ...(FILTERS[filter] ? { tbs: FILTERS[filter] } : {}) }).toString();
  let res;
  try { res = await fetcher(url, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(45000)]) : AbortSignal.timeout(45000) }); }
  catch(e) { if (signal?.aborted) throw new Error('Search cancelled.'); throw new Error('Could not reach SerpAPI. Check your connection and retry.'); }
  if (!res.ok) {
    if ([401,403].includes(res.status)) throw new Error('SerpAPI rejected this key. Check it in Settings.');
    if (res.status === 429) throw new Error('SerpAPI quota or rate limit reached. Try later or check your plan.');
    throw new Error(`SerpAPI returned ${res.status}. Try again shortly.`);
  }
  const data = await res.json();
  if (data.error) {
    const message = String(data.error).split(key).join('[redacted]');
    if (/hasn.t returned any results|no (?:image )?results/i.test(message)) return { images: [], hasMore: false };
    throw new Error(message.slice(0,300));
  }
  const images = (data.images_results || []).filter(i => /^https?:\/\//i.test(i.original || '')).map(i => ({
    id: crypto.randomUUID(), query, title: String(i.title || query), source: String(i.source || 'Web'),
    url: i.original, thumbnail: /^https?:\/\//i.test(i.thumbnail || '') ? i.thumbnail : i.original,
    sourceUrl: /^https?:\/\//i.test(i.link || '') ? i.link : i.original,
    width: Number(i.original_width) || 0, height: Number(i.original_height) || 0, cutout: false,
  }));
  return { images, hasMore: images.length > 0 };
}
class Library {
  constructor(root, downloads) { this.root = root; this.downloads = downloads; this.entries = []; this.tail = Promise.resolve(); }
  async init() { await fs.mkdir(path.join(this.root, 'images'), { recursive: true }); this.entries = await readJSON(path.join(this.root, 'library.json'), []); if (!Array.isArray(this.entries)) throw new Error('Library index is invalid. Existing data preserved.'); }
  list() { return this.entries.map(e => ({ ...e, thumbnail: `sprint://library/${e.id}`, saved: true })); }
  imagePath(id) { const e = this.entries.find(e => e.id === id); if (!e || !/^[^/\\]+\.png$/.test(e.filename)) throw new Error('Saved image not found.'); return path.join(this.root, 'images', e.filename); }
  persist(image, png, action) {
    const task = this.tail.then(async () => {
      let existing = this.entries.find(e => e.url === image.url && e.query === image.query && e.cutout === image.cutout);
      if (!existing) {
        const stem = titleFor(image.query); let count = 1; let filename;
        for (;;) {
          filename = `${stem} (${count++}).png`;
          try { await fs.writeFile(path.join(this.root, 'images', filename), png, { flag: 'wx' }); break; }
          catch(e) { if (e.code !== 'EEXIST') throw e; }
        }
        existing = { id: crypto.randomUUID(), filename, name: path.parse(filename).name, query: image.query, title: image.title, url: image.url, source: image.source, sourceUrl: image.sourceUrl, cutout: !!image.cutout, createdAt: new Date().toISOString(), width: image.width, height: image.height };
        this.entries.unshift(existing);
        try { await atomicJSON(path.join(this.root, 'library.json'), this.entries); }
        catch(e) { this.entries.shift(); throw e; }
      }
      let downloadPath;
      if (action === 'save') {
        await fs.mkdir(this.downloads, { recursive: true });
        let count = Number(existing.name.match(/\((\d+)\)$/)?.[1] || 1);
        for (;;) {
          downloadPath = path.join(this.downloads, `${titleFor(image.query)} (${count++}).png`);
          try { await fs.writeFile(downloadPath, png, { flag: 'wx' }); break; }
          catch(e) { if(e.code !== 'EEXIST') throw e; }
        }
      }
      return { entry: { ...existing, thumbnail: `sprint://library/${existing.id}`, saved: true }, downloadPath, downloadName: downloadPath ? path.basename(downloadPath) : undefined };
    });
    this.tail = task.catch(() => {}); return task;
  }
}
module.exports = { titleFor, readJSON, atomicJSON, isPublicIP, publicURL, downloadImage, searchImages, Library };
