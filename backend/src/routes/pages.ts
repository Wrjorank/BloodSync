import path from 'path';
import express, { Router } from 'express';

// serves the frontend so pages and api share one origin. frontend/ holds only public files;
// backend/ and the uploaded letters live outside it and are never reachable from here
const FRONTEND_ROOT = path.resolve(__dirname, '../../../frontend');

// clean url -> html file. the admin page answers only on its own slug, never as admin.html
// maps, not object literals: a url like /constructor must not resolve to an inherited property
const PAGES = new Map([
  ['pasien', 'pasien.html'],
  ['pendonor', 'pendonor.html'],
  ['faskes', 'faskes.html'],
  ['kartu', 'kartu.html'],
  ['secretgate19', 'admin.html'],
]);

// old .html links (whatsapp messages already sent, bookmarks) -> their clean url
const LEGACY = new Map([
  ['index', '/'],
  ['pasien', '/pasien'],
  ['pendonor', '/pendonor'],
  ['faskes', '/faskes'],
  ['kartu', '/kartu'],
]);

const router = Router();

router.get('/:page.html', (req, res, next) => {
  if (req.params.page === 'admin') return res.status(404).end();
  const target = LEGACY.get(req.params.page);
  if (!target) return next();
  res.redirect(301, target + req.originalUrl.slice(req.path.length));
});

router.get('/:slug', (req, res, next) => {
  const file = PAGES.get(req.params.slug);
  if (!file) return next();
  res.sendFile(path.join(FRONTEND_ROOT, file));
});

router.use(express.static(FRONTEND_ROOT, { dotfiles: 'ignore', index: 'index.html' }));

export default router;
