// end-to-end checks against a running server (local docker or staging):
//   API_URL=http://localhost:5000 npm test
// skipped when API_URL is not set, so `npm test` stays fast and needs no database
import { describe, expect, it } from 'vitest';

const base = process.env.API_URL?.replace(/\/$/, '');
const get = (path: string, init?: RequestInit) => fetch(base + path, init);

describe.skipIf(!base)('smoke: running server', () => {
  it('reports database and redis up', async () => {
    const res = await get('/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ db: 'up' });
  });

  it('serves public metadata and the faskes list', async () => {
    const meta = await (await get('/api/public/meta')).json();
    expect(meta.success).toBe(true);
    expect(meta.data.bloodTypes).toContain('O+');
    const faskes = await (await get('/api/public/facilities')).json();
    expect(Array.isArray(faskes.data)).toBe(true);
  });

  it('rejects api calls without a session', async () => {
    expect((await get('/api/facility/me/dashboard')).status).toBe(401);
    expect((await get('/api/admin/audit-logs')).status).toBe(401);
  });

  it('rejects a wrong staff password', async () => {
    const res = await get('/api/auth/staff/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'nobody@bloodsync.id', password: 'definitely-wrong' }),
    });
    expect(res.status).toBe(401);
  });

  it('refuses the whatsapp webhook without its secret', async () => {
    expect((await get('/api/webhooks/whatsapp')).status).toBe(403);
  });

  it('compresses scripts', async () => {
    const res = await get('/js/ui.js', { headers: { 'Accept-Encoding': 'gzip' } });
    expect(res.headers.get('content-encoding')).toBe('gzip');
  });
});
