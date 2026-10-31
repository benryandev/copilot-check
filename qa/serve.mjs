// Local static server that sends the same headers as vercel.json (so CSP problems show up before deploy). Dev only.
import { createServer } from 'node:http'; import { readFile } from 'node:fs/promises'; import { extname, join, normalize } from 'node:path';
const root = new URL('..', import.meta.url).pathname;
const vh = JSON.parse(await readFile(join(root, 'vercel.json'), 'utf8')).headers[0].headers
  // Dev only: let the page reach a local copilot-world room (wrangler dev on 8787) as well as the live one
  .map(h => (h.key.toLowerCase() === 'content-security-policy' ? { ...h, value: h.value.replace('connect-src ', 'connect-src ws://localhost:8787 ') } : h));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.glb': 'model/gltf-binary', '.txt': 'text/plain; charset=utf-8' };
const port = Number(process.env.PORT || 8080);
createServer(async (req, res) => {
  let p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)); if (p.endsWith('/')) p += 'index.html';
  if (/^\/paper\/[A-Za-z0-9_-]+$/.test(p)) p = '/paper.html';
  if (p.includes('..')) { res.writeHead(400).end(); return; }
  try { const body = await readFile(join(root, p)); res.writeHead(200, { 'content-type': types[extname(p)] || 'application/octet-stream', ...Object.fromEntries(vh.map(h => [h.key, h.value])) }); res.end(body); }
  catch { res.writeHead(404).end('not found'); }
}).listen(port, () => console.log(`http://localhost:${port}`));
