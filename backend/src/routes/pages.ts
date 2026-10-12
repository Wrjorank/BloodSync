import path from 'path';
import express, { Router } from 'express';

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

const query = (req: express.Request) => req.originalUrl.slice(req.path.length);

const router = Router();

router.get('/:page.html', (req, res, next) => {
  if (req.params.page === 'admin') return res.status(404).end();
  const target = LEGACY.get(req.params.page);
  if (!target) return next();
  res.redirect(301, target + query(req));
});

router.get('/:slug/:view?', (req, res, next) => {
  const { slug, view } = req.params;
  const page = PAGES.get(slug);
  if (!page) {
    // old indonesian slugs (/pasien, /faskes) were live for a while; send them to the english ones
    const target = !view && LEGACY.get(slug);
    return target && target !== `/${slug}` ? res.redirect(301, target + query(req)) : next();
  }
  if (view && !page.views?.includes(view)) return next();
  res.sendFile(path.join(FRONTEND_ROOT, page.file));
});

router.use(express.static(FRONTEND_ROOT, { dotfiles: 'ignore', index: 'index.html' }));

export default router;
