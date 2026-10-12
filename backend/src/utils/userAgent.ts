// small user-agent reader for the audit log; order matters because most browsers also claim to be chrome and safari
const BROWSERS: [string, RegExp][] = [
  ['Edge', /Edg(?:e|A|iOS)?\/([\d.]+)/],
  ['Opera', /(?:OPR|Opera)\/([\d.]+)/],
  ['Samsung Internet', /SamsungBrowser\/([\d.]+)/],
  ['Firefox', /(?:Firefox|FxiOS)\/([\d.]+)/],
  ['Chrome', /(?:Chrome|CriOS)\/([\d.]+)/],
  ['Safari', /Version\/([\d.]+).*Safari/],
];

const PLATFORMS: [string, RegExp][] = [
  ['Android', /Android/],
  ['iOS', /iPhone|iPad|iPod/],
  ['Windows', /Windows/],
  ['macOS', /Mac OS X|Macintosh/],
  ['Linux', /Linux/],
];

export interface ClientInfo {
  browser: string;
  platform: string;
  device: 'mobile' | 'tablet' | 'desktop' | 'bot' | 'unknown';
}

export function parseUserAgent(ua?: string | null): ClientInfo {
  if (!ua) return { browser: 'Unknown', platform: 'Unknown', device: 'unknown' };
  if (/bot|crawler|spider|curl|wget|postman|insomnia|node-fetch|axios|python-requests/i.test(ua)) {
    const tool = /^([\w-]+)\/([\d.]+)/.exec(ua);
    return { browser: tool ? `${tool[1]} ${tool[2]}` : 'Bot', platform: 'Unknown', device: 'bot' };
  }
  const browser = BROWSERS.find(([, re]) => re.test(ua));
  const platform = PLATFORMS.find(([, re]) => re.test(ua));
  const device = /iPad|Tablet/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua)) ? 'tablet' : /Mobi|iPhone|Android/.test(ua) ? 'mobile' : 'desktop';
  return {
    browser: browser ? `${browser[0]} ${browser[1].exec(ua)![1]}` : 'Unknown',
    platform: platform ? platform[0] : 'Unknown',
    device,
  };
}
