// Lumira API logic for Netlify Functions. Storage is injected so the same code runs
// on Netlify (Netlify Blobs) and in offline tests (in-memory store).
import { products as seedProducts } from './catalog.mjs';

const MAX_BODY = 16 * 1024;
const CATEGORIES = ['smartphones', 'laptops', 'smartwatches', 'audio', 'accessories'];
const SID_RE = /^[a-f0-9]{32}$/;
const RX = {
  id: /^[a-z0-9-]{1,64}$/,
  name: /^[\p{L}\p{M}][\p{L}\p{M}\s'.-]{1,98}[\p{L}\p{M}.]$/u,
  city: /^[\p{L}\p{M}][\p{L}\p{M}\s'.-]{0,78}[\p{L}\p{M}.]$/u,
  phone: /^\+?[0-9][0-9\s-]{6,18}$/,
  postal: /^[A-Za-z0-9][A-Za-z0-9\s-]{0,18}$/,
  street: /^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N}\s,.'#/-]{2,148}$/u,
  email: /^[^\s@<>()[\],;:"\\]{1,64}@[^\s@<>()[\],;:"\\]{1,189}\.[A-Za-z]{2,24}$/,
  control: /[\u0000-\u001F\u007F]/
};

class HttpError extends Error {
  constructor(status, message, extra) { super(message); this.status = status; this.extra = extra; }
}

function clean(v, max) {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!t || t.length > max || RX.control.test(t)) return null;
  return t;
}
function validEmail(v) { const e = clean(v, 254); return e && RX.email.test(e) ? e.toLowerCase() : null; }
function validQty(v) { return Number.isInteger(v) && v >= 1 && v <= 20 ? v : null; }
function safeDecode(v) { try { return decodeURIComponent(v); } catch (e) { return null; } }
function validProductId(v) { return typeof v === 'string' && RX.id.test(v) ? v : null; }

function json(status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...extraHeaders
    }
  });
}

async function readJson(request) {
  const type = (request.headers.get('content-type') || '').split(';')[0].trim();
  if (type !== 'application/json') throw new HttpError(415, 'Send JSON with Content-Type: application/json');
  const len = Number(request.headers.get('content-length') || 0);
  if (len > MAX_BODY) throw new HttpError(413, 'Request is too large');
  const text = await request.text();
  if (text.length > MAX_BODY) throw new HttpError(413, 'Request is too large');
  if (!text) return {};
  try { return JSON.parse(text); } catch (e) { throw new HttpError(400, 'Invalid JSON'); }
}

function checkOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return;
  let host;
  try { host = new URL(origin).host; } catch (e) { throw new HttpError(403, 'Forbidden origin'); }
  if (host !== new URL(request.url).host) throw new HttpError(403, 'Forbidden origin');
}

function sessionFrom(request) {
  const m = /(?:^|;\s*)lsid=([a-f0-9]{32})(?:;|$)/.exec(request.headers.get('cookie') || '');
  return m && SID_RE.test(m[1]) ? m[1] : null;
}

function cookieHeader(sid, request) {
  const parts = [`lsid=${sid}`, 'Path=/', 'HttpOnly', 'SameSite=Strict', `Max-Age=${60 * 60 * 24 * 30}`];
  if (new URL(request.url).protocol === 'https:') parts.push('Secure');
  return parts.join('; ');
}

export function createShop(getStore) {
  let storePromise = null;
  const store = () => (storePromise ||= Promise.resolve(getStore()));

  async function loadProducts() {
    const s = await store();
    let list = await s.get('products', { type: 'json' });
    if (!list) {
      list = seedProducts.map((p) => ({ ...p, priceCents: Math.round(p.price * 100) }));
      await s.setJSON('products', list);
    }
    return list;
  }
  async function saveProducts(list) { await (await store()).setJSON('products', list); }
  const publicProduct = (p) => ({
    id: p.id, name: p.name, brand: p.brand, category: p.category, price: p.priceCents / 100,
    image: p.image, bg: p.bg, featured: !!p.featured, stock: p.stock, keywords: p.keywords || '',
    specs: p.specs || [], colors: p.colors || []
  });

  async function loadCart(sid) {
    if (!sid) return {};
    return (await (await store()).get(`cart:${sid}`, { type: 'json' })) || {};
  }
  async function saveCart(sid, cart) { await (await store()).setJSON(`cart:${sid}`, cart); }

  async function cartView(sid) {
    const cart = await loadCart(sid);
    const products = await loadProducts();
    let total = 0; let count = 0;
    const items = [];
    for (const [id, qty] of Object.entries(cart)) {
      const p = products.find((x) => x.id === id);
      if (!p) continue;
      total += p.priceCents * qty; count += qty;
      items.push({ productId: p.id, name: p.name, image: p.image, bg: p.bg, unitPrice: p.priceCents / 100, qty, lineTotal: (p.priceCents * qty) / 100, stock: p.stock });
    }
    return { items, count, subtotal: total / 100, currency: 'USD' };
  }

  async function handle(request) {
    const url = new URL(request.url);
    let path = url.pathname;
    if (path.startsWith('/.netlify/functions/api')) path = path.slice('/.netlify/functions/api'.length);
    else if (path.startsWith('/api')) path = path.slice(4);
    const method = request.method;
    try {
      if (method === 'GET' && path === '/health') {
        const orders = (await (await store()).list({ prefix: 'order:' })).blobs.length;
        return json(200, { ok: true, products: (await loadProducts()).length, orders });
      }
      if (method === 'GET' && path === '/products') {
        const list = (await loadProducts()).map(publicProduct);
        return json(200, { products: list, categories: CATEGORIES }, { 'Cache-Control': 'public, max-age=60' });
      }
      const detail = /^\/products\/([^/]+)$/.exec(path);
      if (method === 'GET' && detail) {
        const id = validProductId(safeDecode(detail[1]));
        const p = id && (await loadProducts()).find((x) => x.id === id);
        if (!p) return json(404, { error: 'Product not found' });
        return json(200, { product: publicProduct(p) }, { 'Cache-Control': 'public, max-age=60' });
      }
      if (method === 'GET' && path === '/cart') {
        return json(200, await cartView(sessionFrom(request)));
      }
      if (method === 'POST' && path === '/cart') {
        checkOrigin(request);
        const body = await readJson(request);
        const id = validProductId(body.productId);
        const qty = validQty(body.qty);
        const mode = body.mode === 'set' ? 'set' : 'add';
        if (!id) throw new HttpError(400, 'Invalid product');
        if (qty === null && !(mode === 'set' && body.qty === 0)) throw new HttpError(400, 'Quantity must be 1 to 20');
        const product = (await loadProducts()).find((x) => x.id === id);
        if (!product) throw new HttpError(404, 'Product not found');
        const sid = sessionFrom(request) || crypto.randomUUID().replace(/-/g, '');
        const cart = await loadCart(sid);
        const have = cart[id] || 0;
        const next = mode === 'set' ? (body.qty === 0 ? 0 : qty) : have + qty;
        const headers = sessionFrom(request) ? {} : { 'Set-Cookie': cookieHeader(sid, request) };
        if (next === 0) delete cart[id];
        else {
          if (next > product.stock) return json(409, { error: `Only ${product.stock} left in stock`, ...(await cartView(sid)) }, headers);
          cart[id] = next;
        }
        await saveCart(sid, cart);
        return json(200, await cartView(sid), headers);
      }
      const del = /^\/cart\/([^/]+)$/.exec(path);
      if (method === 'DELETE' && del) {
        checkOrigin(request);
        const id = validProductId(safeDecode(del[1]));
        if (!id) throw new HttpError(400, 'Invalid product');
        const sid = sessionFrom(request);
        if (sid) { const cart = await loadCart(sid); delete cart[id]; await saveCart(sid, cart); }
        return json(200, await cartView(sid));
      }
      if (method === 'POST' && path === '/orders') {
        checkOrigin(request);
        const body = await readJson(request);
        const f = {
          name: clean(body.name, 100), email: validEmail(body.email), phone: clean(body.phone, 20),
          street: clean(body.street, 150), city: clean(body.city, 80), postal: body.postal ? clean(body.postal, 20) : '',
          country: clean(body.country, 80)
        };
        const errors = {};
        if (!f.name || !RX.name.test(f.name)) errors.name = 'Enter your full name.';
        if (!f.email) errors.email = 'Enter a valid email address.';
        if (!f.phone || !RX.phone.test(f.phone)) errors.phone = 'Enter a valid phone number.';
        if (!f.street || !RX.street.test(f.street)) errors.street = 'Enter your street address.';
        if (!f.city || !RX.city.test(f.city)) errors.city = 'Enter your city.';
        if (!f.country || !RX.city.test(f.country)) errors.country = 'Enter your country.';
        if (f.postal && !RX.postal.test(f.postal)) errors.postal = 'Enter a valid postal code.';
        if (body.payment !== 'cod') errors.payment = 'Choose a payment method. Only pay on delivery is available.';
        if (Object.keys(errors).length) return json(422, { error: 'Please correct the highlighted fields.', fields: errors });

        const sid = sessionFrom(request);
        const cart = await loadCart(sid);
        const ids = Object.keys(cart);
        if (!ids.length) return json(409, { error: 'Your cart is empty.' });
        const products = await loadProducts();
        let total = 0;
        const lines = [];
        for (const id of ids) {
          const p = products.find((x) => x.id === id);
          if (!p || p.stock < cart[id]) return json(409, { error: `Not enough stock for ${p ? p.name : 'an item'}. Please review your cart.` });
          total += p.priceCents * cart[id];
          lines.push({ p, qty: cart[id] });
        }
        for (const { p, qty } of lines) p.stock -= qty;
        await saveProducts(products);
        const reference = 'LM-' + Date.now().toString(36).toUpperCase() + '-' + crypto.randomUUID().slice(0, 4).toUpperCase();
        const createdAt = new Date().toISOString();
        await (await store()).setJSON(`order:${reference}`, {
          reference, ...f, payment: 'cod', status: 'received', createdAt, totalCents: total,
          items: lines.map(({ p, qty }) => ({ productId: p.id, name: p.name, unitPriceCents: p.priceCents, qty }))
        });
        await saveCart(sid, {});
        return json(201, { reference, total: total / 100, status: 'received', createdAt });
      }
      if (method === 'POST' && path === '/newsletter') {
        checkOrigin(request);
        const email = validEmail((await readJson(request)).email);
        if (!email) return json(422, { error: 'Enter a valid email address.' });
        const s = await store();
        if (!(await s.get(`newsletter:${email}`, { type: 'json' }))) await s.setJSON(`newsletter:${email}`, { email, createdAt: new Date().toISOString() });
        return json(201, { ok: true, message: 'Thanks for subscribing!' });
      }
      if (method === 'POST' && path === '/contact') {
        checkOrigin(request);
        const body = await readJson(request);
        const name = clean(body.name, 100);
        const email = validEmail(body.email);
        const message = clean(body.message, 2000);
        const errors = {};
        if (!name || !RX.name.test(name)) errors.name = 'Enter your name.';
        if (!email) errors.email = 'Enter a valid email address.';
        if (!message || message.length < 10) errors.message = 'Message must be at least 10 characters.';
        if (Object.keys(errors).length) return json(422, { error: 'Please correct the highlighted fields.', fields: errors });
        await (await store()).setJSON(`message:${Date.now()}-${crypto.randomUUID().slice(0, 8)}`, { name, email, message, createdAt: new Date().toISOString() });
        return json(201, { ok: true, message: 'Thanks! We will get back to you.' });
      }
      if (!['GET', 'POST', 'DELETE'].includes(method)) return json(405, { error: 'Method not allowed' }, { Allow: 'GET, POST, DELETE' });
      return json(404, { error: 'Not found' });
    } catch (err) {
      if (err instanceof HttpError) return json(err.status, { error: err.message });
      console.error('Server error:', err && err.message);
      return json(500, { error: 'Something went wrong. Please try again.' });
    }
  }
  return { handle };
}
