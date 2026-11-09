// Tests every channel in prime-src.m3u the way a browser on the site would
// and writes the ones that play to prime.m3u.
// Removed: http links, dead links (network error, 404, 5xx), servers
// without CORS, and HLS channels whose playlist opens but whose video
// segments are refused (locked to the broadcaster's own site).
// Kept: a playlist answering 401/403, since that is often a geo-block that
// works for viewers in the right country.
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

async function get(url, range) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), TIMEOUT);
  try {
    const headers = { Origin: ORIGIN, Referer: ORIGIN + '/', 'User-Agent': 'Mozilla/5.0' };
    if (range) headers.Range = 'bytes=0-2047';
    const r = await fetch(url, { signal: ctl.signal, redirect: 'follow', headers });
    const isList = /mpegurl/i.test(r.headers.get('content-type') || '') || /\.m3u8(\?|$)/i.test(r.url);
    const text = r.ok && isList ? await r.text() : (r.body?.cancel().catch(() => {}), null);
    return { r, text };
  } finally { clearTimeout(t); }
}

// Follow an HLS playlist down to its newest segment and ask for its first bytes.
async function segmentRefused(listUrl, text) {
  for (let depth = 0; depth < 3; depth++) {
    const uris = text.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'));
    if (!uris.length) return false;
    const master = /#EXT-X-STREAM-INF/.test(text);
    const next = new URL(master ? uris[0] : uris[uris.length - 1], listUrl).href;
    const { r, text: sub } = await get(next, !master);
    if (r.status === 401 || r.status === 403) return true;
    if (!master || !sub) return false;
    listUrl = r.url; text = sub;
  }
  return false;
}

async function check(url) {
  if (!url.startsWith('https:')) return false;
  try {
    const { r, text } = await get(url);
    if (r.status === 401 || r.status === 403) return true;
    if (!r.ok || !r.headers.has('access-control-allow-origin')) return false;
    if (text) try { return !(await segmentRefused(r.url, text)); } catch { return true; }
    return true;
  } catch { return false; }
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
