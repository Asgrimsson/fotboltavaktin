const cheerio = require('cheerio');

const SOURCES = {
  ksi: 'https://www.ksi.is/leikir-og-urslit/felagslid/',
  fotbolti: 'https://fotbolti.net/',
  urslit: 'https://www.urslit.net/'
};

const MONTHS = {
  'janúar': 0, 'januar': 0, 'jan': 0,
  'febrúar': 1, 'februar': 1, 'feb': 1,
  'mars': 2, 'mar': 2,
  'apríl': 3, 'april': 3, 'apr': 3,
  'maí': 4, 'mai': 4,
  'júní': 5, 'juni': 5,
  'júlí': 6, 'juli': 6,
  'ágúst': 7, 'agust': 7,
  'september': 8, 'sep': 8,
  'október': 9, 'oktober': 9, 'okt': 9,
  'nóvember': 10, 'november': 10, 'nóv': 10, 'nov': 10,
  'desember': 11, 'des': 11
};

const DAY_RE = /^(Mán|Man|Þri|Thri|Mið|Mid|Fim|Fös|Fos|Lau|Sun)\s+(\d{1,2})\.\s+([A-Za-zÁÉÍÓÚÝÞÆÖÐáéíóúýþæöð]+)\s+(\d{1,2}:\d{2})/i;
const DATE_ONLY_RE = /^(\d{1,2})\.\s+([A-Za-zÁÉÍÓÚÝÞÆÖÐáéíóúýþæöð]+)$/i;

function clean(text) {
  return String(text || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function normalizeName(s) {
  return clean(s).replace(/\s+/g, ' ');
}

function parseIcelandicDate(day, monthName, time) {
  const now = new Date();
  const monthKey = monthName.toLowerCase().normalize('NFC');
  const month = MONTHS[monthKey] ?? MONTHS[monthKey.replace(/[ú]/g, 'u').replace(/[í]/g, 'i').replace(/[ó]/g, 'o').replace(/[á]/g, 'a')];
  if (month === undefined) return null;
  const [hh, mm] = time.split(':').map(Number);
  let year = now.getUTCFullYear();
  let start = new Date(Date.UTC(year, month, Number(day), hh, mm, 0));
  // If the parsed date is more than 6 months behind/ahead, adjust around new year.
  const diffDays = (start.getTime() - now.getTime()) / 86400000;
  if (diffDays < -180) start = new Date(Date.UTC(year + 1, month, Number(day), hh, mm, 0));
  if (diffDays > 180) start = new Date(Date.UTC(year - 1, month, Number(day), hh, mm, 0));
  return start;
}

function statusFromStart(startIso, score) {
  if (score && /\d/.test(score)) return 'lokið';
  if (!startIso) return 'á dagskrá';
  const now = Date.now();
  const start = new Date(startIso).getTime();
  const end = start + 2 * 60 * 60 * 1000;
  if (now >= start && now <= end) return 'í gangi';
  if (now > end) return 'líklega lokið';
  return 'á eftir';
}

function uniqueMatches(matches) {
  const seen = new Set();
  return matches.filter(m => {
    const key = [m.source, m.startTime || m.rawTime, m.home, m.away, m.competition].join('|').toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      'user-agent': 'Fotboltavaktin/0.1 (+personal school project)',
      'accept': 'text/html,application/xhtml+xml'
    }
  });
  if (!res.ok) throw new Error(`${url} svaraði ${res.status}`);
  return await res.text();
}

function parseKsi(html) {
  const $ = cheerio.load(html);
  const lines = $('body').text().split('\n').map(clean).filter(Boolean);
  const matches = [];
  let currentDateLabel = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const dateOnly = line.match(DATE_ONLY_RE);
    if (dateOnly) currentDateLabel = line;

    const tm = line.match(DAY_RE);
    if (!tm) continue;

    const rawTime = line;
    const start = parseIcelandicDate(tm[2], tm[3], tm[4]);
    const venue = lines[i + 1] || '';
    let competition = lines[i + 2] || '';
    let teamsLine = '';
    let j = i + 3;
    while (j < Math.min(i + 12, lines.length)) {
      if (/\s+-\s+/.test(lines[j]) && !DAY_RE.test(lines[j])) {
        teamsLine = lines[j];
        break;
      }
      j++;
    }
    if (!teamsLine) continue;
    const [homeRaw, awayRaw] = teamsLine.split(/\s+-\s+/);
    const home = normalizeName(homeRaw);
    const away = normalizeName(awayRaw);
    if (!home || !away) continue;
    competition = clean(competition.replace(/^Image:?/i, ''));

    matches.push({
      id: `ksi-${start ? start.toISOString() : rawTime}-${home}-${away}`.toLowerCase().replace(/[^a-z0-9áéíóúýþæöð-]+/gi, '-'),
      source: 'KSÍ',
      sourceUrl: SOURCES.ksi,
      dateLabel: currentDateLabel,
      rawTime,
      startTime: start ? start.toISOString() : null,
      localTime: tm[4],
      venue,
      competition,
      home,
      away,
      score: '',
      status: statusFromStart(start ? start.toISOString() : null, '')
    });
  }
  return matches;
}

function parseFotbolti(html) {
  // Fotbolti.net is used as a future/secondary source. The homepage is large and changes often,
  // so this parser only extracts obvious match rows in text when they appear.
  const $ = cheerio.load(html);
  const text = $('body').text().replace(/\s+/g, ' ');
  const candidates = [];
  const re = /(\d{1,2}:\d{2})\s+([A-ZÁÉÍÓÚÝÞÆÖÐa-záéíóúýþæöð0-9 .\/]+?)\s+-\s+([A-ZÁÉÍÓÚÝÞÆÖÐa-záéíóúýþæöð0-9 .\/]+?)(?=\s{2,}| \d{1,2}:\d{2}|$)/g;
  let m;
  while ((m = re.exec(text)) && candidates.length < 25) {
    const home = normalizeName(m[2]);
    const away = normalizeName(m[3]);
    if (home.length > 1 && away.length > 1 && home.length < 40 && away.length < 40) {
      candidates.push({
        id: `fotbolti-${m[1]}-${home}-${away}`.toLowerCase().replace(/[^a-z0-9áéíóúýþæöð-]+/gi, '-'),
        source: 'Fótbolti.net',
        sourceUrl: SOURCES.fotbolti,
        rawTime: m[1],
        localTime: m[1],
        startTime: null,
        venue: '',
        competition: '',
        home,
        away,
        score: '',
        status: 'óstaðfest'
      });
    }
  }
  return candidates;
}

async function getAllMatches() {
  const errors = [];
  let matches = [];

  try {
    matches = matches.concat(parseKsi(await fetchText(SOURCES.ksi)));
  } catch (err) {
    errors.push(`KSÍ: ${err.message}`);
  }

  // Keep secondary fetches best-effort. They are useful as scouts, but KSÍ is the primary feed.
  try {
    matches = matches.concat(parseFotbolti(await fetchText(SOURCES.fotbolti)));
  } catch (err) {
    errors.push(`Fótbolti.net: ${err.message}`);
  }

  // Úrslit.net is often client-rendered; we currently use it as a checked source, not primary parsing.
  try {
    await fetchText(SOURCES.urslit);
  } catch (err) {
    errors.push(`Úrslit.net: ${err.message}`);
  }

  matches = uniqueMatches(matches).sort((a, b) => {
    if (!a.startTime && !b.startTime) return 0;
    if (!a.startTime) return 1;
    if (!b.startTime) return -1;
    return new Date(a.startTime) - new Date(b.startTime);
  });

  return { matches, errors };
}

exports.handler = async () => {
  try {
    const { matches, errors } = await getAllMatches();
    return {
      statusCode: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'public, max-age=120, s-maxage=180'
      },
      body: JSON.stringify({
        ok: true,
        updatedAt: new Date().toISOString(),
        count: matches.length,
        sources: SOURCES,
        note: 'KSÍ er aðalheimild í v0.1. Staða í gangi er reiknuð út frá leiktíma þegar lifandi staða er ekki tiltæk.',
        errors,
        matches
      })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ ok: false, error: err.message })
    };
  }
};
