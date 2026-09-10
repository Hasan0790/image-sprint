import sharp from 'sharp';
import fs from 'node:fs/promises';
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><rect x="2" y="2" width="252" height="252" rx="57" fill="#d9cef6"/><path d="M143 40 65 145h58l-11 73 83-115h-62z" fill="#302b3b"/></svg>';
await fs.mkdir('assets',{recursive:true});await fs.writeFile('assets/icon.svg',svg);
const png=await sharp(Buffer.from(svg)).png().toBuffer();await fs.writeFile('assets/icon.png',png);
const header=Buffer.alloc(22);header.writeUInt16LE(1,2);header.writeUInt16LE(1,4);header.writeUInt16LE(1,10);header.writeUInt16LE(32,12);header.writeUInt32LE(png.length,14);header.writeUInt32LE(22,18);
await fs.writeFile('assets/icon.ico',Buffer.concat([header,png]));
