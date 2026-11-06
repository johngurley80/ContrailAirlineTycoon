// Assembles the shell, engine, map data and UI into one HTML file.
//   dist/contrail.html  - the page body published as an artifact (skeleton added at publish time)
//   dist/preview.html   - the same page wrapped in a full document for local testing
const fs = require('fs');
const path = require('path');

const root = __dirname;
const read = (...p) => fs.readFileSync(path.join(root, ...p), 'utf8');
const ENGINE = [
  'data/cities', 'data/aircraft', 'data/history', 'data/people',
  'engine/core', 'engine/market', 'engine/actions', 'engine/events', 'engine/ai', 'engine/advisor', 'engine/finance', 'engine/ops', 'engine/deals', 'engine/plans', 'engine/turn',
];
const UI = ['util', 'art', 'charts', 'map', 'sheets', 'panels', 'modals', 'main'];

const land = read('data', 'land.txt').trim();
const engine = ENGINE.map(f => read('src', f + '.js')).join('\n');
const ui = `const LAND_SRC = '${land}';\n` + UI.map(f => read('src', 'ui', f + '.js')).join('\n');
const page = read('src', 'shell.html')
  .replace('/*__ENGINE__*/', () => engine)
  .replace('/*__UI__*/', () => ui);

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'contrail.html'), page);
fs.writeFileSync(path.join(root, 'dist', 'preview.html'),
  '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
  '<style>body{margin:0}[hidden]{display:none!important}</style></head><body>' +
  page + '</body></html>');
// dist/index.html - a complete web page for normal hosting (Vercel, GitHub Pages)
const SITE = 'https://contrail-airline-tycoon.vercel.app';
const split = page.indexOf('<div id="app">');
const icon = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 64 64%22%3E%3Crect width=%2264%22 height=%2264%22 rx=%2214%22 fill=%22%23111b2d%22/%3E%3Cpath d=%22M10 38l18-5V16a4 4 0 018 0v17l18 5v5l-18-3v11l6 4v4l-10-3-10 3v-4l6-4V40l-18 3z%22 fill=%22%23f4b13e%22/%3E%3C/svg%3E';
fs.writeFileSync(path.join(root, 'dist', 'index.html'), `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#111b2d">
<meta name="description" content="Build a world airline across twenty years of aviation history. A phone-friendly airline management game.">
<link rel="icon" href="${icon}">
<meta property="og:type" content="website">
<meta property="og:title" content="Golden Route: Airline Empire">
<meta property="og:description" content="Build a world airline across twenty years of aviation history. Free to play in your browser, on phone or desktop.">
<meta property="og:url" content="${SITE}/">
<meta property="og:image" content="${SITE}/og-image.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
${page.slice(0, split).replace(/<meta name="claude:[^>]*>\r?\n?/, '')}<style>body{margin:0}</style>
</head>
<body>
${page.slice(split)}
</body>
</html>
`);
fs.copyFileSync(path.join(root, 'assets', 'og-image.jpg'), path.join(root, 'dist', 'og-image.jpg'));
// dist/golden-route-itch.zip - index.html at the top level, ready to upload to itch.io as an HTML game
fs.writeFileSync(path.join(root, 'dist', 'golden-route-itch.zip'), zip([['index.html', fs.readFileSync(path.join(root, 'dist', 'index.html'))]]));
console.log('built', (page.length / 1024).toFixed(1) + ' KB', '· itch.io zip ready: dist/golden-route-itch.zip');

// A minimal zip writer (deflate, no dependencies).
function zip(files) {
  const zlib = require('zlib');
  const table = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc32 = buf => { let c = 0xffffffff; for (const b of buf) c = table[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const d = new Date(), time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const locals = [], centrals = [];
  let offset = 0;
  for (const [name, data] of files) {
    const nameBuf = Buffer.from(name), body = zlib.deflateRawSync(data, { level: 9 }), crc = crc32(data);
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(0, 6); head.writeUInt16LE(8, 8);
    head.writeUInt16LE(time, 10); head.writeUInt16LE(date, 12); head.writeUInt32LE(crc, 14);
    head.writeUInt32LE(body.length, 18); head.writeUInt32LE(data.length, 22); head.writeUInt16LE(nameBuf.length, 26); head.writeUInt16LE(0, 28);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(0, 8); cen.writeUInt16LE(8, 10);
    cen.writeUInt16LE(time, 12); cen.writeUInt16LE(date, 14); cen.writeUInt32LE(crc, 16); cen.writeUInt32LE(body.length, 20);
    cen.writeUInt32LE(data.length, 24); cen.writeUInt16LE(nameBuf.length, 28); cen.writeUInt32LE(offset, 42);
    locals.push(head, nameBuf, body); centrals.push(cen, nameBuf);
    offset += head.length + nameBuf.length + body.length;
  }
  const cenSize = centrals.reduce((t, b) => t + b.length, 0), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cenSize, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}
