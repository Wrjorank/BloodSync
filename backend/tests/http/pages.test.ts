import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import pages from '../../src/routes/pages';

const app = express().use(pages);

describe('page routes', () => {
  it.each(['/', '/patient', '/donor', '/card', '/facility', '/facility/stock', '/facility/notifications', '/secretgate19', '/secretgate19/audit-log'])(
    'serves %s as html that is always revalidated',
    async (url) => {
      const res = await request(app).get(url);
      expect(res.status).toBe(200);
      expect(res.type).toBe('text/html');
      expect(res.headers['cache-control']).toBe('no-cache');
    },
  );

  it('rejects sub-views a page does not have', async () => {
    expect((await request(app).get('/facility/bogus')).status).toBe(404);
  });

  it('never serves the admin page under its file name', async () => {
    expect((await request(app).get('/admin.html')).status).toBe(404);
  });

  it.each([
    ['/faskes.html', '/facility'],
    ['/pasien', '/patient'],
    ['/kartu.html?t=abc', '/card?t=abc'],
    ['/index.html', '/'],
  ])('redirects the old link %s to %s', async (from, to) => {
    const res = await request(app).get(from);
    expect(res.status).toBe(301);
    expect(res.headers.location).toBe(to);
  });

  it('does not resolve inherited object keys as pages', async () => {
    expect((await request(app).get('/constructor')).status).toBe(404);
    expect((await request(app).get('/__proto__')).status).toBe(404);
  });

  it('stamps a version on asset urls and caches versioned assets for a year', async () => {
    const html = (await request(app).get('/facility')).text;
    const asset = /src="(\/js\/ui\.js\?v=[^"]+)"/.exec(html)?.[1];
    expect(asset).toBeDefined();
    const res = await request(app).get(asset!);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toContain('immutable');
  });

  it('keeps the service worker uncached', async () => {
    const res = await request(app).get('/sw.js');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-cache');
  });
});
