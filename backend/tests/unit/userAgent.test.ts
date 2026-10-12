import { describe, expect, it } from 'vitest';
import { parseUserAgent } from '../../src/utils/userAgent';

describe('parseUserAgent', () => {
  it('reads edge on windows (which also claims chrome and safari)', () => {
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36 Edg/155.0.0.0';
    expect(parseUserAgent(ua)).toEqual({ browser: 'Edge 155.0.0.0', platform: 'Windows', device: 'desktop' });
  });

  it('reads safari on iphone as a mobile device', () => {
    const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
    expect(parseUserAgent(ua)).toEqual({ browser: 'Safari 18.0', platform: 'iOS', device: 'mobile' });
  });

  it('reads chrome on an android phone and an android tablet', () => {
    expect(parseUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36'))
      .toMatchObject({ browser: 'Chrome 130.0', platform: 'Android', device: 'mobile' });
    expect(parseUserAgent('Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'))
      .toMatchObject({ platform: 'Android', device: 'tablet' });
  });

  it('labels scripts and tools as bots', () => {
    expect(parseUserAgent('curl/8.21.0')).toEqual({ browser: 'curl 8.21.0', platform: 'Unknown', device: 'bot' });
  });

  it('handles a missing header', () => {
    expect(parseUserAgent(undefined)).toEqual({ browser: 'Unknown', platform: 'Unknown', device: 'unknown' });
  });
});
