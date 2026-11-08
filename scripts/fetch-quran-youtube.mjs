// Builds quran/yt.json (lectures of the scholars and recitations of the reciters)
// so visitors need no API key. Runs daily from GitHub Actions with the same key
// as the movies list; one page per category keeps it near 2,600 of the 10,000 daily units.
import { readFileSync, writeFileSync } from 'node:fs';

const KEY = process.env.YT_API_KEY;
if (!KEY) { console.error('YT_API_KEY is not set'); process.exit(1); }
const OUT = 'quran/yt.json';

// [chip label, search query, YouTube duration filter]
const CATS = [
  ['ابن باز', 'الشيخ ابن باز محاضرة', 'long'],
  ['ابن عثيمين', 'الشيخ ابن عثيمين محاضرة', 'long'],
  ['الألباني', 'الشيخ الألباني محاضرة', 'long'],
  ['أبو إسحاق الحويني', 'الشيخ ابو اسحاق الحويني محاضرة', 'long'],
  ['محمد حسين يعقوب', 'الشيخ محمد حسين يعقوب محاضرة', 'long'],
  ['محمد حسان', 'الشيخ محمد حسان محاضرة', 'long'],
  ['صالح الفوزان', 'الشيخ صالح الفوزان محاضرة', 'long'],
  ['عبد الرزاق البدر', 'الشيخ عبد الرزاق البدر محاضرة', 'long'],
  ['صالح آل الشيخ', 'الشيخ صالح ال الشيخ شرح', 'long'],
  ['محمد المختار الشنقيطي', 'الشيخ محمد المختار الشنقيطي درس', 'long'],
  ['سليمان الرحيلي', 'الشيخ سليمان الرحيلي محاضرة', 'long'],
  ['مقبل الوادعي', 'الشيخ مقبل الوادعي محاضرة', 'long'],
  ['أبو بكر الجزائري', 'الشيخ ابو بكر الجزائري درس', 'long'],
  ['مصطفى العدوي', 'الشيخ مصطفى العدوي محاضرة', 'long'],
  ['عثمان الخميس', 'الشيخ عثمان الخميس محاضرة', 'long'],
  ['عبد المحسن العباد', 'الشيخ عبد المحسن العباد شرح', 'long'],
  ['شرح الأربعين النووية', 'شرح الاربعين النووية', 'long'],
  ['السيرة النبوية', 'السيرة النبوية كاملة محاضرة', 'long'],
  ['المنشاوي', 'المنشاوي تلاوة سورة', 'medium'],
  ['عبد الباسط', 'عبد الباسط عبد الصمد تلاوة سورة', 'medium'],
  ['الحصري', 'الحصري تلاوة سورة', 'medium'],
  ['السديس والشريم', 'السديس الشريم تلاوة الحرم', 'medium'],
  ['ماهر المعيقلي', 'ماهر المعيقلي تلاوة سورة', 'medium'],
  ['ياسر الدوسري', 'ياسر الدوسري تلاوة سورة', 'medium'],
  ['مشاري العفاسي', 'مشاري العفاسي سورة كاملة', 'medium'],
];

// keeps the list to lectures and recitations: no music, songs, shorts or reaction clips
const BLOCK = /أغنية|اغنية|اغاني|أغاني|موسيقى|موسيقي|مهرجان|كليب|ريأكشن|reaction|#shorts|\bshorts\b|مسلسل|فيلم/i;

const api = async (path, params) => {
  const r = await fetch(`https://www.googleapis.com/youtube/v3/${path}?` + new URLSearchParams({ ...params, key: KEY }));
  const j = await r.json();
  if (j.error) throw new Error(`${path}: ${j.error.code} ${j.error.message}`);
  return j;
};

// when the daily quota runs out, categories not fetched today keep yesterday's videos
let previous = [];
try { previous = JSON.parse(readFileSync(OUT, 'utf8')).cats; } catch {}
let quotaHit = false;

const out = { updated: new Date().toISOString(), cats: [] };
for (const [name, q, duration] of CATS) {
  if (quotaHit) { keepPrevious(name); continue; }
  try { out.cats.push({ name, videos: await fetchCategory(q, duration) }); console.log(name, out.cats.at(-1).videos.length); }
  catch (e) { console.warn(`${name}: ${e.message} — keeping previous list`); quotaHit = /(403|429)/.test(e.message); keepPrevious(name); }
}
writeFileSync(OUT, JSON.stringify(out));

function keepPrevious(name) {
  const old = previous.find(c => c.name === name);
  if (old) out.cats.push(old);
}

async function fetchCategory(q, videoDuration) {
  const s = await api('search', {
    part: 'snippet', type: 'video', videoDuration, videoEmbeddable: 'true', safeSearch: 'strict',
    maxResults: '50', regionCode: 'SA', relevanceLanguage: 'ar', q,
  });
  const items = s.items.filter(i => i.id.videoId);
  const dur = {};
  if (items.length) {
    const v = await api('videos', { part: 'contentDetails', id: items.map(x => x.id.videoId).join(',') });
    v.items.forEach(x => { dur[x.id] = x.contentDetails.duration; });
  }
  const seen = new Set();
  return items
    .filter(i => !seen.has(i.id.videoId) && seen.add(i.id.videoId))
    .map(i => ({ id: i.id.videoId, t: decode(i.snippet.title), c: decode(i.snippet.channelTitle), d: dur[i.id.videoId] || '' }))
    .filter(v => v.d && !BLOCK.test(v.t));
}

function decode(s) {
  return s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}
