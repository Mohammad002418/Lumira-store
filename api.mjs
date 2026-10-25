// Netlify Function: serves every /api/* request for the Lumira store.
import { getStore } from '@netlify/blobs';
import { createShop } from '../lib/shop.mjs';

const shop = createShop(() => getStore({ name: 'lumira', consistency: 'strong' }));

export default async (request) => shop.handle(request);

export const config = { path: '/api/*' };
