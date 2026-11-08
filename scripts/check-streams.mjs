// Tests every channel in prime-src.m3u the way a browser on the site would
// and writes the ones that play to prime.m3u.
// Removed: http links, dead links (network error, 404, 5xx) and servers
// without CORS. Kept: 401/403, since that is often a geo-block that works
// for viewers in the right country.
import { readFile, writeFile } from 'node:fs/promises';

const ORIGIN = 'https://bmeshary-crypto.github.io';
const CONCURRENCY = 64, TIMEOUT = 10000;

const lines = (await readFile('prime-src.m3u', 'utf8')).split(/\r?\n/);
const entries = []; let info = [];
for (const raw of lines) {
  const l = raw.trim(); if (!l || l === '#EXTM3U') continue;
  if (l.startsWith('#')) info.push(l);
  else { entries.push({ info, url: l }); info = []; }
}

async function check(url) {
  if (!url.startsWith('https:')) return false;
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), TIMEOUT);
  try {
    const r = await fetch(url, { signal: ctl.signal, redirect: 'follow',
      headers: { Origin: ORIGIN, Referer: ORIGIN + '/', 'User-Agent': 'Mozilla/5.0' } });
    r.body?.cancel().catch(() => {});
    if (r.status === 401 || r.status === 403) return true;
    if (!r.ok) return false;
    return r.headers.has('access-control-allow-origin');
  } catch { return false; } finally { clearTimeout(t); }
}

const keep = new Array(entries.length);
let next = 0, done = 0;
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (next < entries.length) {
    const i = next++;
    keep[i] = await check(entries[i].url);
    if (++done % 1000 === 0) console.log(`${done}/${entries.length}`);
  }
}));

const ok = entries.filter((_, i) => keep[i]);
await writeFile('prime.m3u', '#EXTM3U\n' + ok.map(e => [...e.info, e.url].join('\n')).join('\n') + '\n');
console.log(`kept ${ok.length} of ${entries.length}`);
