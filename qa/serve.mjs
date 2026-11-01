// Local static server that sends the same headers as vercel.json (so CSP problems show up before deploy). Dev only.
// Every header rule whose source matches the path applies, later rules overriding earlier ones for the same header,
// which is how Vercel applies them (the arcade pages get a CSP that allows framing by this origin).
import { createServer } from 'node:http'; import { readFile } from 'node:fs/promises'; import { extname, join, normalize } from 'node:path';
const root = new URL('..', import.meta.url).pathname;
const rules = JSON.parse(await readFile(join(root, 'vercel.json'), 'utf8')).headers.map(r => ({ re: new RegExp(`^${r.source}$`), headers: r.headers }));
const headersFor = p => {
  const out = {};
  for (const r of rules) if (r.re.test(p)) for (const h of r.headers) out[h.key] = h.value;
  // Dev only: let the page reach a local copilot-world room (wrangler dev on 8787) as well as the live one
  if (out['Content-Security-Policy']) out['Content-Security-Policy'] = out['Content-Security-Policy'].replace('connect-src ', 'connect-src ws://localhost:8787 ');
  return out;
};
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.glb': 'model/gltf-binary', '.txt': 'text/plain; charset=utf-8' };
const port = Number(process.env.PORT || 8080);
createServer(async (req, res) => {
  const urlPath = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
  let p = urlPath; if (p.endsWith('/')) p += 'index.html';
  if (/^\/paper\/[A-Za-z0-9_-]+$/.test(p)) p = '/paper.html';
  if (p.includes('..')) { res.writeHead(400).end(); return; }
  try { const body = await readFile(join(root, p)); res.writeHead(200, { 'content-type': types[extname(p)] || 'application/octet-stream', ...headersFor(urlPath) }); res.end(body); }
  catch { res.writeHead(404).end('not found'); }
}).listen(port, () => console.log(`http://localhost:${port}`));
