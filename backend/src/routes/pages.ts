import fs from 'fs';
import path from 'path';
import express, { Router } from 'express';
import { env } from '../config/env';

// serves the frontend so pages and api share one origin. frontend/ holds only public files;
// backend/ and the uploaded letters live outside it and are never reachable from here
const FRONTEND_ROOT = path.resolve(__dirname, '../../../frontend');

// clean url -> html file, plus the sub-views a dashboard handles client side (/facility/stock, /secretgate19/accounts)
// maps, not object literals: a url like /constructor must not resolve to an inherited property
const PAGES = new Map<string, { file: string; views?: string[] }>([
  ['patient', { file: 'patient.html' }],
  ['donor', { file: 'donor.html' }],
  ['card', { file: 'card.html' }],
  ['facility', { file: 'facility.html', views: ['stock', 'requests', 'scanner', 'donors', 'notifications'] }],
  // super admin answers only on this slug, never as admin.html
  ['secretgate19', { file: 'admin.html', views: ['overview', 'facilities', 'accounts', 'audit-log'] }],
]);

// links already out in the wild (whatsapp messages, bookmarks, old .html urls) -> their current url
const LEGACY = new Map([
  ['index', '/'],
  ['pasien', '/patient'],
  ['pendonor', '/donor'],
  ['faskes', '/facility'],
  ['kartu', '/card'],
  ['patient', '/patient'],
  ['donor', '/donor'],
  ['facility', '/facility'],
  ['card', '/card'],
]);

// ---------- caching ----------
// every deploy gets a new version, stamped into asset urls (/js/ui.js?v=...). a versioned url never changes content,
// so browsers keep it for a year; html itself is always revalidated and therefore always points at the current assets
const VERSION = (process.env.APP_VERSION || Date.now().toString(36)).replace(/[^\w.-]/g, '');
const ASSET_URL = /((?:src|href)=")(\/(?:js|css|vendor|assets)\/[^"?#]+)(")/g;

const pageCache = new Map<string, string>();
function renderPage(file: string) {
  // development reads the file every time so edits show up on refresh
  const cached = env.isProduction ? pageCache.get(file) : undefined;
  if (cached) return cached;
  const html = fs.readFileSync(path.join(FRONTEND_ROOT, file), 'utf8').replace(ASSET_URL, `$1$2?v=${VERSION}$3`);
  pageCache.set(file, html);
  return html;
}

function sendPage(res: express.Response, file: string) {
  res.setHeader('Cache-Control', 'no-cache');
  res.type('html').send(renderPage(file));
}

const query = (req: express.Request) => req.originalUrl.slice(req.path.length);

const router = Router();

router.get('/:page.html', (req, res, next) => {
  if (req.params.page === 'admin') return res.status(404).end();
  const target = LEGACY.get(req.params.page);
  if (!target) return next();
  res.redirect(301, target + query(req));
});

router.get('/', (_req, res) => sendPage(res, 'index.html'));

router.get('/:slug/:view?', (req, res, next) => {
  const { slug, view } = req.params;
  const page = PAGES.get(slug);
  if (!page) {
    // old indonesian slugs (/pasien, /faskes) were live for a while; send them to the english ones
    const target = !view && LEGACY.get(slug);
    return target && target !== `/${slug}` ? res.redirect(301, target + query(req)) : next();
  }
  if (view && !page.views?.includes(view)) return next();
  sendPage(res, page.file);
});

router.use(express.static(FRONTEND_ROOT, {
  dotfiles: 'ignore',
  index: false,
  setHeaders(res, file) {
    const url = (res.req as express.Request).originalUrl;
    // the service worker must always be fresh, or a broken one could stay installed for days
    if (file.endsWith('firebase-messaging-sw.js')) res.setHeader('Cache-Control', 'no-cache');
    else if (/[?&]v=/.test(url)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    // unversioned (lazy-loaded sdk, images referenced from css): cache briefly, then revalidate by etag
    else res.setHeader('Cache-Control', 'public, max-age=3600');
  },
}));

export default router;
