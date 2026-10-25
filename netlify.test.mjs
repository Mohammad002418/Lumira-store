// Offline tests for the Netlify API logic, using an in-memory store in place of Netlify Blobs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createShop } from '../netlify/lib/shop.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const ORIGIN = 'https://lumira.example';

function memoryStore() {
  const m = new Map();
  return {
    async get(k) { return m.has(k) ? JSON.parse(m.get(k)) : null; },
    async setJSON(k, v) { m.set(k, JSON.stringify(v)); },
    async delete(k) { m.delete(k); },
    async list({ prefix = '' } = {}) { return { blobs: [...m.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; },
    _raw: m
  };
}

function setup() {
  const store = memoryStore();
  const shop = createShop(() => store);
  let cookie = '';
  const call = async (method, p, { json, body, headers = {} } = {}) => {
    const h = new Headers({ origin: ORIGIN, ...headers });
    if (cookie) h.set('cookie', cookie);
    let b;
    if (json !== undefined) { h.set('content-type', 'application/json'); b = JSON.stringify(json); }
    if (body !== undefined) b = body;
    const req = new Request(ORIGIN + p, { method, headers: h, body: b });
    const res = await shop.handle(req);
    const sc = res.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    const text = await res.text();
    let data = null; try { data = JSON.parse(text); } catch (e) {}
    return { status: res.status, headers: res.headers, text, data };
  };
  return { store, call, setCookie: (c) => { cookie = c; } };
}

const VALID = { name: 'Sara Ali', email: 'sara@example.com', phone: '+249 912 345678', street: '12 Main Street', city: 'Khartoum', postal: '11111', country: 'Sudan', payment: 'cod' };

test('products: list, detail, 404', async () => {
  const { call } = setup();
  const list = await call('GET', '/api/products');
  assert.equal(list.status, 200);
  assert.equal(list.data.products.length, 22);
  assert.equal((await call('GET', '/api/products/laptop-flip')).data.product.name, 'Convertible Laptop 14"');
  assert.equal((await call('GET', '/api/products/nope')).status, 404);
});

test('cart: add, set, remove, totals from server prices', async () => {
  const { call } = setup();
  let r = await call('POST', '/api/cart', { json: { productId: 'wireless-mouse', qty: 2 } });
  assert.equal(r.data.count, 2);
  assert.equal(r.data.subtotal, 38);
  r = await call('POST', '/api/cart', { json: { productId: 'wireless-mouse', qty: 1, price: 0.01 } });
  assert.equal(r.data.items[0].unitPrice, 19);
  r = await call('POST', '/api/cart', { json: { productId: 'wireless-mouse', mode: 'set', qty: 0 } });
  assert.equal(r.data.count, 0);
});

test('cart: a new visitor gets a session cookie, and the cart persists', async () => {
  const { call } = setup();
  const r = await call('POST', '/api/cart', { json: { productId: 'phone-case', qty: 1 } });
  assert.match(r.headers.get('set-cookie'), /lsid=[a-f0-9]{32}; Path=\/; HttpOnly; SameSite=Strict/);
  assert.equal((await call('GET', '/api/cart')).data.count, 1);
});

test('cart: another browser cannot see the cart', async () => {
  const a = setup();
  await a.call('POST', '/api/cart', { json: { productId: 'phone-case', qty: 1 } });
  const b = setup();
  assert.equal((await b.call('GET', '/api/cart')).data.count, 0);
});

test('cart: quantity limits and types', async () => {
  const { call } = setup();
  for (const bad of [0, 21, 1.5, '2', -1, null]) {
    const r = await call('POST', '/api/cart', { json: { productId: 'wireless-mouse', qty: bad } });
    assert.equal(r.status, 400, JSON.stringify(bad));
  }
  assert.equal((await call('POST', '/api/cart', { json: { productId: 'laptop-gaming-16', qty: 5 } })).status, 409);
});

test('security: injection and XSS in ids and fields are rejected', async () => {
  const { call } = setup();
  for (const pl of ["x' OR 1=1 --", '1 UNION SELECT * FROM orders', '../secret']) {
    assert.equal((await call('POST', '/api/cart', { json: { productId: pl, qty: 1 } })).status, 400, pl);
  }
  const r = await call('POST', '/api/orders', { json: { ...VALID, name: '<img src=x onerror=alert(1)>', street: '<script>x</script>' } });
  assert.equal(r.status, 422);
  assert.ok(r.data.fields.name && r.data.fields.street);
});

test('security: cross-site POST refused; form-style POST refused', async () => {
  const { call } = setup();
  const cross = await call('POST', '/api/cart', { json: { productId: 'phone-case', qty: 1 }, headers: { origin: 'https://evil.example' } });
  assert.equal(cross.status, 403);
  const plain = await call('POST', '/api/cart', { body: '{"productId":"phone-case","qty":1}', headers: { 'content-type': 'text/plain' } });
  assert.equal(plain.status, 415);
});

test('security: oversized and malformed bodies rejected', async () => {
  const { call } = setup();
  const big = await call('POST', '/api/contact', { body: JSON.stringify({ name: 'a'.repeat(40000) }), headers: { 'content-type': 'application/json' } });
  assert.equal(big.status, 413);
  const bad = await call('POST', '/api/contact', { body: '{bad', headers: { 'content-type': 'application/json' } });
  assert.equal(bad.status, 400);
});

test('security: forged cookies are ignored', async () => {
  const { call, setCookie } = setup();
  setCookie("lsid=<script>alert(1)</script>");
  const r = await call('GET', '/api/cart');
  assert.equal(r.status, 200);
  assert.equal(r.data.count, 0);
});

test('security: responses never leak stack traces', async () => {
  const { call } = setup();
  const r = await call('GET', '/api/products/%E0%A4%A');
  assert.equal(r.status, 404);
  assert.ok(!/at .*\.(m?js):\d+/.test(r.text));
});

test('orders: validation saves nothing; empty cart refused', async () => {
  const { call, store } = setup();
  assert.equal((await call('POST', '/api/orders', { json: VALID })).status, 409);
  await call('POST', '/api/cart', { json: { productId: 'wireless-mouse', qty: 1 } });
  const r = await call('POST', '/api/orders', { json: { ...VALID, email: 'nope', payment: 'card' } });
  assert.equal(r.status, 422);
  assert.ok(r.data.fields.email && r.data.fields.payment);
  assert.equal([...store._raw.keys()].filter((k) => k.startsWith('order:')).length, 0);
});

test('orders: valid order saved, stock reduced, cart cleared, total from server', async () => {
  const { call, store } = setup();
  await call('POST', '/api/cart', { json: { productId: 'power-bank', qty: 2 } });
  const r = await call('POST', '/api/orders', { json: VALID });
  assert.equal(r.status, 201);
  assert.match(r.data.reference, /^LM-[A-Z0-9]+-[A-F0-9]{4}$/);
  assert.equal(r.data.total, 78);
  const stock = (await call('GET', '/api/products/power-bank')).data.product.stock;
  assert.equal(stock, 38);
  assert.equal((await call('GET', '/api/cart')).data.count, 0);
  assert.ok(await store.get(`order:${r.data.reference}`, { type: 'json' }));
});

test('orders: out-of-stock at checkout time is refused and nothing is saved', async () => {
  const { call, store } = setup();
  await call('POST', '/api/cart', { json: { productId: 'watch-pink', qty: 1 } });
  const products = await store.get('products', { type: 'json' });
  products.find((p) => p.id === 'watch-pink').stock = 0;
  await store.setJSON('products', products);
  const r = await call('POST', '/api/orders', { json: VALID });
  assert.equal(r.status, 409);
  assert.equal([...store._raw.keys()].filter((k) => k.startsWith('order:')).length, 0);
});

test('newsletter and contact store data and validate', async () => {
  const { call, store } = setup();
  assert.equal((await call('POST', '/api/newsletter', { json: { email: 'Fan@Example.com' } })).status, 201);
  assert.equal((await call('POST', '/api/newsletter', { json: { email: 'fan@example.com' } })).status, 201);
  assert.equal((await call('POST', '/api/newsletter', { json: { email: 'nope' } })).status, 422);
  assert.ok(await store.get('newsletter:fan@example.com', { type: 'json' }));
  assert.equal((await call('POST', '/api/contact', { json: { name: 'Sara Ali', email: 'sara@example.com', message: 'Do you deliver to Port Sudan?' } })).status, 201);
  assert.equal((await call('POST', '/api/contact', { json: { name: 'Sara Ali', email: 'sara@example.com', message: 'hi' } })).status, 422);
});

test('routing: unknown paths 404; wrong methods 405', async () => {
  const { call } = setup();
  assert.equal((await call('GET', '/api/nothing')).status, 404);
  assert.equal((await call('PUT', '/api/cart', { json: {} })).status, 405);
});

test('deploy: static pages have no inline scripts and headers file exists', () => {
  const dir = path.join(here, '..', 'public');
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.html'))) {
    const s = fs.readFileSync(path.join(dir, f), 'utf8');
    assert.ok(!/<script>/.test(s), `${f} has an inline script`);
    assert.ok(!/to be provided|to be added/i.test(s), `${f} has placeholder text`);
  }
  assert.ok(fs.existsSync(path.join(dir, '_headers')));
  assert.ok(fs.readFileSync(path.join(dir, '_headers'), 'utf8').includes("script-src 'self'"));
});
