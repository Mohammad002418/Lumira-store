// Local runner for testing the Netlify build: serves public/ and routes /api/* to the same
// logic the Netlify Function uses. Data is kept in a JSON file to mimic Netlify Blobs.
// Usage: PORT=3000 LUMIRA_DATA=./data/dev-store.json node dev-netlify.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createShop } from './netlify/lib/shop.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(here, 'public');
const DATA = process.env.LUMIRA_DATA || path.join(here, 'data', 'dev-store.json');
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1';
fs.mkdirSync(path.dirname(DATA), { recursive: true });

function fileStore() {
  const load = () => { try { return JSON.parse(fs.readFileSync(DATA, 'utf8')); } catch (e) { return {}; } };
  const save = (m) => fs.writeFileSync(DATA, JSON.stringify(m));
  return {
    async get(k) { const m = load(); return k in m ? m[k] : null; },
    async setJSON(k, v) { const m = load(); m[k] = v; save(m); },
    async delete(k) { const m = load(); delete m[k]; save(m); },
    async list({ prefix = '' } = {}) { return { blobs: Object.keys(load()).filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; }
  };
}
const shop = createShop(fileStore);
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.webp': 'image/webp', '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml' };

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/api/')) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
    headers.set('host', `${HOST}:${PORT}`);
    const init = { method: req.method, headers };
    if (chunks.length) init.body = Buffer.concat(chunks);
    const origin = req.headers.origin ? new URL(req.url, `http://${HOST}:${PORT}`) : null;
    const r = await shop.handle(new Request(`http://${HOST}:${PORT}${url.pathname}${url.search}`, init));
    res.statusCode = r.status;
    r.headers.forEach((v, k) => res.setHeader(k, v));
    return res.end(Buffer.from(await r.arrayBuffer()));
  }
  let rel = decodeURIComponent(url.pathname); if (rel.endsWith('/')) rel += 'index.html'; if (rel === '') rel = '/index.html';
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.statusCode = 404; res.setHeader('Content-Type', TYPES['.html']); return res.end(fs.readFileSync(path.join(PUBLIC, '404.html')));
  }
  res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(fs.readFileSync(file));
}).listen(PORT, HOST, () => console.log(`Lumira (Netlify build) at http://${HOST}:${PORT}`));
