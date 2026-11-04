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
const UI = ['util', 'charts', 'map', 'sheets', 'panels', 'modals', 'main'];

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
const split = page.indexOf('<div id="app">');
const icon = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 64 64%22%3E%3Crect width=%2264%22 height=%2264%22 rx=%2214%22 fill=%22%23111b2d%22/%3E%3Cpath d=%22M10 38l18-5V16a4 4 0 018 0v17l18 5v5l-18-3v11l6 4v4l-10-3-10 3v-4l6-4V40l-18 3z%22 fill=%22%23f4b13e%22/%3E%3C/svg%3E';
fs.writeFileSync(path.join(root, 'dist', 'index.html'), `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#111b2d">
<meta name="description" content="Build a world airline across twenty years of aviation history. A phone-friendly airline tycoon game.">
<link rel="icon" href="${icon}">
${page.slice(0, split).replace(/<meta name="claude:[^>]*>\r?\n?/, '')}<style>body{margin:0}</style>
</head>
<body>
${page.slice(split)}
</body>
</html>
`);
console.log('built', (page.length / 1024).toFixed(1) + ' KB');
