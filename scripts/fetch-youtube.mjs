// Builds yt.json (full-length YouTube movies per category) so visitors need no API key.
// Runs daily from GitHub Actions with the key stored in the YT_API_KEY secret.
import { writeFileSync } from 'node:fs';

const KEY = process.env.YT_API_KEY;
if (!KEY) { console.error('YT_API_KEY is not set'); process.exit(1); }

const CATS = [
  ['أفلام عربية', 'فيلم عربي كامل'],
  ['مصري قديم', 'فيلم مصري قديم كامل'],
  ['أبيض وأسود', 'فيلم ابيض واسود كامل'],
  ['كوميدي', 'فيلم كوميدي عربي كامل'],
  ['أكشن عربي', 'فيلم اكشن عربي كامل'],
  ['رومانسي', 'فيلم رومانسي عربي كامل'],
  ['خليجي', 'فيلم خليجي كامل'],
  ['سوري ولبناني', 'فيلم سوري كامل'],
  ['أجنبي مترجم', 'full movie arabic subtitles'],
  ['أجنبي', 'full movie english'],
  ['أطفال مدبلج', 'فيلم كرتون كامل مدبلج'],
  ['وثائقي', 'فيلم وثائقي كامل'],
  ['إسماعيل ياسين', 'فيلم اسماعيل ياسين كامل'],
  ['عادل إمام', 'فيلم عادل امام كامل'],
  ['فاتن حمامة', 'فيلم فاتن حمامة كامل'],
  ['عبد الحليم', 'فيلم عبد الحليم حافظ كامل'],
  ['شادية', 'فيلم شادية كامل'],
  ['فريد شوقي', 'فيلم فريد شوقي كامل'],
  ['أحمد زكي', 'فيلم احمد زكي كامل'],
  ['سعاد حسني', 'فيلم سعاد حسني كامل'],
  ['محمد هنيدي', 'فيلم محمد هنيدي كامل'],
  ['ليلى مراد', 'فيلم ليلى مراد كامل'],
];
const PAGES = 2; // 2 x 50 results per category; ~4,500 of the 10,000 daily quota units

const BLOCK = /\b(sex|sexy|erotic|nude|nudity|naked|porn|xxx|adult|strip|bikini|lust|seduction)|سكس|اغراء|إغراء|عاري|ساخن|للكبار|\+18|18\+/i;

const api = async (path, params) => {
  const r = await fetch(`https://www.googleapis.com/youtube/v3/${path}?` + new URLSearchParams({ ...params, key: KEY }));
  const j = await r.json();
  if (j.error) throw new Error(`${path}: ${j.error.code} ${j.error.message}`);
  return j;
};

const out = { updated: new Date().toISOString(), cats: [] };
for (const [name, q] of CATS) {
  const items = []; let pageToken = '';
  for (let p = 0; p < PAGES; p++) {
    const s = await api('search', {
      part: 'snippet', type: 'video', videoDuration: 'long', videoEmbeddable: 'true', safeSearch: 'strict',
      maxResults: '50', regionCode: 'SA', relevanceLanguage: 'ar', q, ...(pageToken && { pageToken }),
    });
    items.push(...s.items.filter(i => i.id.videoId));
    pageToken = s.nextPageToken; if (!pageToken) break;
  }
  const dur = {};
  for (let i = 0; i < items.length; i += 50) {
    const v = await api('videos', { part: 'contentDetails', id: items.slice(i, i + 50).map(x => x.id.videoId).join(',') });
    v.items.forEach(x => { dur[x.id] = x.contentDetails.duration; });
  }
  const seen = new Set();
  const films = items
    .filter(i => !seen.has(i.id.videoId) && seen.add(i.id.videoId))
    .map(i => ({ id: i.id.videoId, t: i.snippet.title, c: i.snippet.channelTitle, d: dur[i.id.videoId] || '' }))
    .filter(f => f.d && !BLOCK.test(f.t) && !/مسلسل|الحلقة|حلقة|episode/i.test(f.t));
  out.cats.push({ name, films });
  console.log(name, films.length);
}
writeFileSync('yt.json', JSON.stringify(out));
