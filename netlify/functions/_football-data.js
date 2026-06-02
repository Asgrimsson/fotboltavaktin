const cheerio = require('cheerio');

const SOURCES = {
  ksi: 'https://www.ksi.is/leikir-og-urslit/felagslid/',
  ksiCompetitions: 'https://www.ksi.is/oll-mot/',
  urslit: 'https://www.urslit.net/'
};

const FEATURED_COMPETITIONS = [];

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

const DAY_RE = /^((?:Mán|Man|Þri|Thri|Mið|Mid|Fim|Fös|Fos|Lau|Sun|mánudagur|manudagur|þriðjudagur|thridjudagur|miðvikudagur|midvikudagur|fimmtudagur|föstudagur|fostudagur|laugardagur|sunnudagur))\s+(\d{1,2})\.\s+([A-Za-zÁÉÍÓÚÝÞÆÖÐáéíóúýþæöð]+)\s+(\d{1,2}:\d{2})/i;
const DATE_ONLY_RE = /^(\d{1,2})\.\s+([A-Za-zÁÉÍÓÚÝÞÆÖÐáéíóúýþæöð]+)$/i;
const DATE_LINE_RE = /^(mánudagur|þriðjudagur|miðvikudagur|fimmtudagur|föstudagur|laugardagur|sunnudagur)\s+\d{1,2}\.\s+[a-záéíóúýþæöð]+/i;

function clean(text) {
  return String(text || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function normalizeName(s) {
  return clean(s).replace(/\s+/g, ' ').replace(/\s+$/g, '');
}

function normalizeKey(value) {
  return clean(value)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/ð/g, 'd').replace(/þ/g, 'th').replace(/æ/g, 'ae').replace(/ö/g, 'o')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function slug(value) {
  return normalizeKey(value).replace(/\s+/g, '-') || 'okunnugt';
}

function absoluteKsiUrl(href) {
  if (!href) return '';
  if (/^https?:\/\//i.test(href)) return href;
  return `https://www.ksi.is${href.startsWith('/') ? '' : '/'}${href}`;
}

function competitionIdFromUrl(url) {
  const m = String(url || '').match(/[?&](?:id|competitionId)=(\d+)/i);
  return m ? m[1] : '';
}

function parseIcelandicDate(day, monthName, time) {
  const now = new Date();
  const monthKey = monthName.toLowerCase().normalize('NFC');
  const fallbackKey = monthKey.replace(/[ú]/g, 'u').replace(/[í]/g, 'i').replace(/[ó]/g, 'o').replace(/[á]/g, 'a');
  const month = MONTHS[monthKey] ?? MONTHS[fallbackKey];
  if (month === undefined) return null;
  const [hh, mm] = time.split(':').map(Number);
  let year = now.getUTCFullYear();
  let start = new Date(Date.UTC(year, month, Number(day), hh, mm, 0));
  const diffDays = (start.getTime() - now.getTime()) / 86400000;
  if (diffDays < -180) start = new Date(Date.UTC(year + 1, month, Number(day), hh, mm, 0));
  if (diffDays > 180) start = new Date(Date.UTC(year - 1, month, Number(day), hh, mm, 0));
  return start;
}

function parseScore(score) {
  const m = clean(score).match(/^(\d{1,2})\s*[-:]\s*(\d{1,2})$/);
  if (!m) return null;
  return { home: Number(m[1]), away: Number(m[2]) };
}

function statusFromStart(startIso, score) {
  if (parseScore(score)) return 'lokið';
  if (!startIso) return 'á dagskrá';
  const now = Date.now();
  const start = new Date(startIso).getTime();
  const end = start + 2 * 60 * 60 * 1000;
  if (now >= start && now <= end) return 'í gangi';
  if (now > end) return 'líklega lokið';
  return 'á eftir';
}

function makeId(source, startTime, home, away, competition, score = '') {
  return slug([source, startTime || '', home, away, competition, score].join('-')).slice(0, 160);
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      'user-agent': 'Fotboltavaktin/1.2 (+personal school project; polite cache)',
      'accept': 'text/html,application/xhtml+xml'
    }
  });
  if (!res.ok) throw new Error(`${url} svaraði ${res.status}`);
  return await res.text();
}

function collectCompetitionLinks($) {
  const links = new Map();
  $('a[href*="/oll-mot/mot"]').each((_, el) => {
    const text = clean($(el).text());
    const href = $(el).attr('href') || '';
    if (!text || !href) return;
    if (/^\d+$/.test(text) || text.length < 3) return;
    const url = absoluteKsiUrl(href);
    const id = competitionIdFromUrl(url);
    const key = normalizeKey(text);
    if (!key || !id) return;
    // Prefer pure mot?id links over team pages when both exist.
    const existing = links.get(key);
    const isPureMot = /\/oll-mot\/mot\?/.test(url);
    if (!existing || isPureMot) links.set(key, { name: text, url, id, key: slug(text), source: 'KSÍ' });
  });
  return links;
}

function getCompetitionMeta(linkMap, competition) {
  const key = normalizeKey(competition);
  const direct = linkMap.get(key);
  if (direct) return direct;
  // fallback: tolerate missing dash differences or extra season labels
  for (const [k, val] of linkMap.entries()) {
    if (k === key || k.includes(key) || key.includes(k)) return val;
  }
  return { name: competition, url: '', id: '', key: slug(competition), source: '' };
}


function isUsefulToken(line) {
  const text = clean(line);
  return text && !/^Image:?/i.test(text) && !/^(Sjá mót|Sjá leikskýrslu|Atburðir|Leikskýrsla|Staða|Innbyrðis)$/i.test(text);
}

function looksLikeGroupLine(line) {
  const text = clean(line);
  return /^(?:[A-ZÁÉÍÓÚÝÞÆÖÐ])\s*riðill$/i.test(text) || /^[A-ZÁÉÍÓÚÝÞÆÖÐ]\s+riðill$/i.test(text) || /^riðill\s+[A-ZÁÉÍÓÚÝÞÆÖÐ0-9]+$/i.test(text);
}

function isYouthCompetitionName(name) {
  const text = normalizeKey(name);
  // Fjarlægjum yngri flokka frá 2. flokki niður í 5. flokk, en höldum 2.–5. deildum fullorðinna inni.
  return /(?:^|\s)(2|3|4|5)\s+flokkur(?:\s|$)/i.test(text);
}

function isLowerLeagueName(name) {
  const text = normalizeKey(name || '');
  if (/besta\s+deild|lengjudeild/.test(text)) return false;
  if (isYouthCompetitionName(text)) return false;
  return /(?:^|\s)(2|3|4|5)\.??\s*deild/.test(text);
}

function isAllowedMatch(match) {
  if (!match || !match.home || !match.away) return false;
  if (!isLowerLeagueName(match.competition || '')) return false;
  const teamText = normalizeKey(`${match.home} ${match.away}`);
  if (isYouthCompetitionName(teamText)) return false;
  return true;
}

function parseTeamsFromWindow(lines, startIndex) {
  const windowLines = lines.slice(startIndex, startIndex + 16).filter(isUsefulToken);
  for (const line of windowLines) {
    if (/\s+-\s+/.test(line) && !DAY_RE.test(line) && !/^\d+\s*-\s*\d+$/.test(line)) {
      const parts = line.split(/\s+-\s+/);
      if (parts.length >= 2) return { home: normalizeName(parts[0]), away: normalizeName(parts.slice(1).join(' - ')), teamsLine: line };
    }
  }
  for (let i = 0; i < windowLines.length; i++) {
    const line = windowLines[i];
    if (line === '-' || /^[-–—]$/.test(line)) {
      const home = normalizeName(windowLines[i - 1] || '');
      const away = normalizeName(windowLines[i + 1] || '');
      if (home && away) return { home, away, teamsLine: `${home} - ${away}` };
    }
  }
  return { home: '', away: '', teamsLine: '' };
}

function collectMatchReportLinks($) {
  const links = [];
  $('a[href*="/leikir-og-urslit/felagslid/leikur"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const context = clean([$(el).text(), $(el).parent().text(), $(el).closest('tr, li, article, div').text()].join(' ')).slice(0, 1200);
    if (href) links.push({ url: absoluteKsiUrl(href), context });
  });
  return links;
}

function findMatchReportUrl(links, home, away, time = '') {
  const h = normalizeKey(home);
  const a = normalizeKey(away);
  const t = clean(time);
  for (const link of links) {
    const ctx = normalizeKey(link.context);
    const hasTeams = ctx.includes(h) && ctx.includes(a);
    const hasTime = !t || link.context.includes(t);
    if (hasTeams && hasTime) return link.url;
  }
  for (const link of links) {
    const ctx = normalizeKey(link.context);
    if (ctx.includes(h) && ctx.includes(a)) return link.url;
  }
  return '';
}

function parseKsi(html, options = {}) {
  const $ = cheerio.load(html);
  const competitionLinks = collectCompetitionLinks($);
  const reportLinks = collectMatchReportLinks($);
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
    let competition = clean((lines[i + 2] || '').replace(/^Image:?/i, ''));
    let teamStartIndex = i + 3;
    const possibleGroup = clean(lines[i + 3] || '');
    if (looksLikeGroupLine(possibleGroup) && !normalizeKey(competition).includes(normalizeKey(possibleGroup))) {
      competition = clean(`${competition} ${possibleGroup}`);
      teamStartIndex = i + 4;
    }
    const parsedTeams = parseTeamsFromWindow(lines, teamStartIndex);
    const home = parsedTeams.home;
    const away = parsedTeams.away;
    if (!home || !away) continue;
    if (!competition || /^[-–—]$/.test(competition)) competition = options.name || '';
    if (isYouthCompetitionName(competition)) continue;
    const meta = getCompetitionMeta(competitionLinks, competition);
    const officialMeta = options.id && normalizeKey(options.name || '') === normalizeKey(competition) ? options : null;
    const startIso = start ? start.toISOString() : null;
    const reportUrl = findMatchReportUrl(reportLinks, home, away, tm[4]);
    const compUrl = officialMeta?.url || meta.url || options.url || '';
    const compId = officialMeta?.id || meta.id || options.id || '';

    matches.push({
      id: makeId('ksi', startIso || rawTime, home, away, competition),
      source: 'KSÍ',
      sourceUrl: reportUrl || compUrl || SOURCES.ksi,
      matchReportUrl: reportUrl || '',
      dateLabel: currentDateLabel,
      rawTime,
      startTime: startIso,
      localTime: tm[4],
      venue,
      competition,
      competitionKey: slug(competition),
      competitionId: compId || '',
      competitionUrl: compUrl || '',
      home,
      away,
      score: '',
      status: statusFromStart(startIso, '')
    });
  }
  return matches;
}

function parseFotbolti(html) {
  const $ = cheerio.load(html);
  const lines = $('body').text().split('\n').map(clean).filter(Boolean);
  const matches = [];
  let dateLabel = '';
  let competition = '';

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    if (DATE_LINE_RE.test(line)) { dateLabel = line; continue; }
    if (/^(Besta|Lengjudeild|[2-5]\. deild|Mjólkurbikar|Inkasso|Fótbolti\.net|Úrslit|Textalýsingar)/i.test(line) && line.length < 80 && !/\d+\s*-\s*\d+/.test(line)) {
      competition = line;
      continue;
    }

    let quick = line.match(/^(\d{1,2}:\d{2})\s*\|\s*(.+?)\s*-\s*(.+?)\.?$/);
    if (quick) {
      const home = normalizeName(quick[2]);
      const away = normalizeName(quick[3]);
      const venueLine = clean(lines[idx + 1] || '').replace(/^@\s*/, '');
      if (home && away && home.length < 60 && away.length < 60) {
        matches.push({
          id: makeId('fotbolti', `${dateLabel}-${quick[1]}`, home, away, competition),
          source: 'Fótbolti.net',
          sourceUrl: SOURCES.fotbolti,
          dateLabel,
          rawTime: quick[1],
          startTime: null,
          localTime: quick[1],
          venue: venueLine,
          competition,
          competitionKey: slug(competition),
          competitionId: '',
          competitionUrl: '',
          home,
          away,
          score: '',
          status: 'á dagskrá'
        });
      }
      continue;
    }

    let m = line.match(/^(.+?)\s+(\d{1,2})\s*-\s*(\d{1,2})\s+(.+?)\s+-\s+(\d{1,2}:\d{2})\s*$/);
    if (m) {
      const home = normalizeName(m[1]);
      const away = normalizeName(m[4]);
      const score = `${m[2]} - ${m[3]}`;
      if (home && away && home.length < 50 && away.length < 50) {
        matches.push({
          id: makeId('fotbolti', `${dateLabel}-${m[5]}`, home, away, competition, score),
          source: 'Fótbolti.net',
          sourceUrl: SOURCES.fotbolti,
          dateLabel,
          rawTime: m[5],
          startTime: null,
          localTime: m[5],
          venue: '',
          competition,
          competitionKey: slug(competition),
          competitionId: '',
          competitionUrl: '',
          home,
          away,
          score,
          status: 'lokið'
        });
      }
      continue;
    }

    m = line.match(/^(.+?)\s+-\s+(.+?)\s+-\s+(\d{1,2}:\d{2})\s*$/);
    if (m && !/^(https?:|www\.|Image)/i.test(line)) {
      const home = normalizeName(m[1]);
      const away = normalizeName(m[2]);
      if (home && away && home.length < 50 && away.length < 50 && !home.includes('  ') && !away.includes('  ')) {
        matches.push({
          id: makeId('fotbolti', `${dateLabel}-${m[3]}`, home, away, competition),
          source: 'Fótbolti.net',
          sourceUrl: SOURCES.fotbolti,
          dateLabel,
          rawTime: m[3],
          startTime: null,
          localTime: m[3],
          venue: '',
          competition,
          competitionKey: slug(competition),
          competitionId: '',
          competitionUrl: '',
          home,
          away,
          score: '',
          status: 'óstaðfest'
        });
      }
    }
  }
  return matches.slice(0, 120);
}

function uniqueMatches(matches) {
  const seen = new Set();
  return matches.filter(m => {
    const key = [m.source, m.startTime || m.dateLabel || m.rawTime, m.home, m.away, m.competition, m.score].join('|').toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sortMatches(matches) {
  return matches.sort((a, b) => {
    if (a.startTime && b.startTime) return new Date(a.startTime) - new Date(b.startTime);
    if (a.startTime) return -1;
    if (b.startTime) return 1;
    return String(b.dateLabel || '').localeCompare(String(a.dateLabel || ''), 'is');
  });
}

async function getAllMatches() {
  const errors = [];
  let matches = [];

  try {
    matches = matches.concat(parseKsi(await fetchText(SOURCES.ksi)));
  } catch (err) {
    errors.push(`KSÍ: ${err.message}`);
  }

  for (const comp of FEATURED_COMPETITIONS) {
    try {
      matches = matches.concat(parseKsi(await fetchText(comp.url), comp));
    } catch (err) {
      errors.push(`${comp.name}: ${err.message}`);
    }
  }

  // v1.2: KSÍ er eina gagnaveitan fyrir leiki og leikskýrslur.
  // Fótbolti.net var fjarlægt sem fallback þar sem fréttalínur gátu ranglega birst sem atburðir.
  try {
    await fetchText(SOURCES.urslit);
  } catch (err) {
    errors.push(`Úrslit.net: ${err.message}`);
  }

  return { matches: sortMatches(uniqueMatches(matches.filter(isAllowedMatch))), errors };
}

function emptyTeam(team) {
  return { team, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, points: 0, upcoming: 0, form: [] };
}

function addResult(table, home, away, score) {
  if (!table.has(home)) table.set(home, emptyTeam(home));
  if (!table.has(away)) table.set(away, emptyTeam(away));
  const h = table.get(home);
  const a = table.get(away);
  h.played++; a.played++;
  h.gf += score.home; h.ga += score.away;
  a.gf += score.away; a.ga += score.home;
  h.gd = h.gf - h.ga; a.gd = a.gf - a.ga;
  if (score.home > score.away) {
    h.won++; h.points += 3; h.form.unshift('W');
    a.lost++; a.form.unshift('L');
  } else if (score.home < score.away) {
    a.won++; a.points += 3; a.form.unshift('W');
    h.lost++; h.form.unshift('L');
  } else {
    h.drawn++; a.drawn++;
    h.points++; a.points++;
    h.form.unshift('D'); a.form.unshift('D');
  }
}

function addUpcoming(table, home, away) {
  if (!table.has(home)) table.set(home, emptyTeam(home));
  if (!table.has(away)) table.set(away, emptyTeam(away));
  table.get(home).upcoming++;
  table.get(away).upcoming++;
}

function buildCompetitionTable(matches, competitionKey) {
  const relevant = matches.filter(m => (m.competitionKey || slug(m.competition)) === competitionKey);
  const table = new Map();
  for (const m of relevant) {
    const score = parseScore(m.score);
    if (score) addResult(table, m.home, m.away, score);
    else addUpcoming(table, m.home, m.away);
  }
  const rows = Array.from(table.values()).map(row => ({
    ...row,
    gd: row.gf - row.ga,
    avgFor: row.played ? +(row.gf / row.played).toFixed(2) : 0,
    avgAgainst: row.played ? +(row.ga / row.played).toFixed(2) : 0,
    form: row.form.slice(0, 5)
  })).sort((a, b) =>
    b.points - a.points || b.gd - a.gd || b.gf - a.gf || a.team.localeCompare(b.team, 'is')
  ).map((row, idx) => ({ ...row, rank: idx + 1 }));

  return {
    competitionKey,
    competition: relevant.find(m => m.competition)?.competition || '',
    sourceNote: 'Reiknuð tafla úr þeim leikjum/úrslitum sem vefurinn náði að sækja. Notuð sem varaleið ef opinber tafla finnst ekki.',
    tableType: 'calculated',
    completeOfficialTable: false,
    matchCount: relevant.length,
    resultCount: relevant.filter(m => parseScore(m.score)).length,
    sourceUrl: '',
    rows
  };
}

function parseGoals(value) {
  const m = clean(value).match(/(\d+)\s*[-:]\s*(\d+)/);
  return m ? { gf: Number(m[1]), ga: Number(m[2]) } : { gf: 0, ga: 0 };
}

function normalizeOfficialForm(value) {
  const v = clean(value).toUpperCase();
  if (v === 'U' || v === 'W') return 'W';
  if (v === 'J' || v === 'D') return 'D';
  if (v === 'T' || v === 'L') return 'L';
  return '';
}

function officialRowFromCells(cells) {
  const c = cells.map(clean).filter(Boolean);
  if (c.length < 8) return null;
  let offset = 0;
  let rank = Number(c[0]);
  if (!Number.isInteger(rank)) { rank = 0; offset = -1; }
  const team = c[1 + offset];
  const played = Number(c[2 + offset]);
  const won = Number(c[3 + offset]);
  const drawn = Number(c[4 + offset]);
  const lost = Number(c[5 + offset]);
  const goals = parseGoals(c[6 + offset]);
  const gd = Number(String(c[7 + offset]).replace('+', '')) || (goals.gf - goals.ga);
  const points = Number(c[8 + offset]);
  if (!team || !Number.isFinite(played) || !Number.isFinite(points)) return null;
  const form = c.slice(9 + offset).map(normalizeOfficialForm).filter(Boolean).slice(0, 5);
  return {
    rank: rank || 0,
    team,
    played,
    won: Number.isFinite(won) ? won : 0,
    drawn: Number.isFinite(drawn) ? drawn : 0,
    lost: Number.isFinite(lost) ? lost : 0,
    gf: goals.gf,
    ga: goals.ga,
    gd,
    points,
    upcoming: 0,
    form,
    avgFor: played ? +(goals.gf / played).toFixed(2) : 0,
    avgAgainst: played ? +(goals.ga / played).toFixed(2) : 0
  };
}

function parseOfficialKsiTable(html, sourceUrl, fallbackName = '') {
  const $ = cheerio.load(html);
  const pageText = clean($('body').text());
  if (/Engin tafla er til fyrir þetta mót/i.test(pageText)) {
    return {
      competition: fallbackName || clean($('h1').first().text()) || 'Óþekkt mót',
      competitionKey: slug(fallbackName),
      tableType: 'none',
      completeOfficialTable: false,
      sourceUrl,
      sourceNote: 'KSÍ birtir ekki stöðutöflu fyrir þetta mót eins og er.',
      rows: []
    };
  }

  const rows = [];
  $('table tr').each((_, tr) => {
    const cells = $(tr).find('th,td').map((__, cell) => clean($(cell).text())).get();
    const row = officialRowFromCells(cells);
    if (row) rows.push(row);
  });

  // Fallback for cases where the table is rendered in text but not as a plain table.
  if (!rows.length) {
    const lines = $('body').text().split('\n').map(clean).filter(Boolean);
    for (let i = 0; i < lines.length; i++) {
      if (!/^\d+$/.test(lines[i])) continue;
      const maybe = lines.slice(i, i + 12);
      const row = officialRowFromCells(maybe);
      if (row) rows.push(row);
    }
  }

  const competition = fallbackName || clean($('h1').first().text()).replace(/^#\s*/, '') || 'Óþekkt mót';
  return {
    competition,
    competitionKey: slug(competition),
    tableType: rows.length ? 'official' : 'none',
    completeOfficialTable: rows.length > 0,
    sourceUrl,
    sourceNote: rows.length ? 'Opinber tafla sótt af KSÍ mótasíðu.' : 'Tafla fannst ekki í opnu HTML-gögnum KSÍ fyrir þetta mót.',
    matchCount: 0,
    resultCount: 0,
    rows: rows.map((r, idx) => ({ ...r, rank: r.rank || idx + 1 }))
  };
}

async function getOfficialCompetitionTable(meta = {}) {
  const id = meta.id || competitionIdFromUrl(meta.url);
  const url = meta.url || (id ? `https://www.ksi.is/oll-mot/mot?id=${id}` : '');
  if (!url) return null;
  const html = await fetchText(url);
  return parseOfficialKsiTable(html, url, meta.name || meta.competition || '');
}

async function getBestCompetitionTable(matches, matchOrMeta) {
  const competitionKey = matchOrMeta.competitionKey || slug(matchOrMeta.competition || matchOrMeta.name || '');
  const fallback = buildCompetitionTable(matches, competitionKey);
  const meta = {
    name: matchOrMeta.competition || matchOrMeta.name || fallback.competition,
    id: matchOrMeta.competitionId || matchOrMeta.id || '',
    url: matchOrMeta.competitionUrl || matchOrMeta.url || ''
  };
  if (meta.url || meta.id) {
    try {
      const official = await getOfficialCompetitionTable(meta);
      if (official && official.rows.length) {
        official.competitionKey = competitionKey;
        official.matchCount = fallback.matchCount;
        official.resultCount = fallback.resultCount;
        return official;
      }
      if (official && official.tableType === 'none') {
        return { ...official, competitionKey, fallbackRows: fallback.rows, matchCount: fallback.matchCount, resultCount: fallback.resultCount };
      }
    } catch (err) {
      fallback.sourceNote = `Ekki tókst að sækja opinbera KSÍ töflu (${err.message}). Sýni reiknaða varatöflu.`;
      fallback.tableType = 'fallback';
    }
  }
  return fallback;
}


function fuzzyTeamKey(value) {
  return normalizeKey(value)
    .replace(/\b(karla|kvenna|ridill|ri\s*ill|deild|flokkur|lid|lið|a|b|c|d|e|f)\b/g, ' ')
    .replace(/\b\d+\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function findTeamRow(table, team) {
  const wanted = fuzzyTeamKey(team);
  const exact = table.rows.find(r => normalizeKey(r.team) === normalizeKey(team));
  if (exact) return exact;
  if (!wanted) return null;
  return table.rows.find(r => {
    const rowKey = fuzzyTeamKey(r.team);
    return rowKey === wanted || rowKey.includes(wanted) || wanted.includes(rowKey);
  }) || null;
}

function pickValueAfterLabel(lines, labels) {
  const labelRe = new RegExp(`^(${labels.join('|')})\\s*:?\\s*(.*)$`, 'i');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(labelRe);
    if (m) {
      const value = clean(m[2]);
      if (value && !labels.some(l => new RegExp(`^${l}$`, 'i').test(value))) return value;
      const next = clean(lines[i + 1] || '');
      if (next && next.length < 90) return next;
    }
  }
  return '';
}

function parseReportEvents(lines, home, away) {
  const events = [];
  const interesting = /(mark|sjálfsmark|gult|rautt|spjald|skipting|víti|penalti)/i;
  const noise = /(PSG|Liverpool|Arsenal|Man Utd|verðmiða|vill fara|fyrirmyndar|geðveikt|frétt|umfjöllun)/i;
  for (const line of lines) {
    const text = clean(line);
    if (!text || text.length > 130 || noise.test(text)) continue;
    const minute = text.match(/(\d{1,3})\s*['´]/)?.[1] || '';
    // Atburðir eru aðeins sýndir ef mínúta fylgir. Þetta kemur í veg fyrir að fréttafyrirsagnir verði ranglega lesnar sem leikjaatburðir.
    if (!minute || !interesting.test(text)) continue;
    events.push({ minute, type: eventType(text), text });
    if (events.length >= 24) break;
  }
  return events;
}

function eventType(text) {
  if (/mark|sjálfsmark|víti|penalti/i.test(text)) return 'mark';
  if (/rautt/i.test(text)) return 'rautt spjald';
  if (/gult|spjald/i.test(text)) return 'spjald';
  if (/skipting/i.test(text)) return 'skipting';
  return 'atburður';
}

function parseLineupBlock(lines, label) {
  const start = lines.findIndex(l => new RegExp(label, 'i').test(l));
  if (start < 0) return [];
  const out = [];
  for (let i = start + 1; i < Math.min(lines.length, start + 35); i++) {
    const line = clean(lines[i]);
    if (!line || /^(varamenn|dómari|atburðir|mörk|leik lokið|staða|skiptingar)/i.test(line)) break;
    if (line.length < 60 && !/^\d+$/.test(line)) out.push(line);
    if (out.length >= 18) break;
  }
  return out;
}

function parseMatchReportHtml(html, match, url) {
  const $ = cheerio.load(html);
  const lines = $('body').text().split('\n').map(clean).filter(Boolean);
  const fullText = lines.join('\n');
  const referee = pickValueAfterLabel(lines, ['Dómari', 'Aðaldómari']);
  const assistantsRaw = [pickValueAfterLabel(lines, ['Aðstoðardómari 1', 'Aðstoðardómari']), pickValueAfterLabel(lines, ['Aðstoðardómari 2']), pickValueAfterLabel(lines, ['Eftirlitsmaður'])].filter(Boolean);
  const attendance = pickValueAfterLabel(lines, ['Áhorfendur', 'Ahorfendur']);
  const events = parseReportEvents(lines, match.home, match.away);
  const homeLineup = parseLineupBlock(lines, `${match.home}.*(byrjunar|leikmenn)|Byrjunarlið.*${match.home}`);
  const awayLineup = parseLineupBlock(lines, `${match.away}.*(byrjunar|leikmenn)|Byrjunarlið.*${match.away}`);
  const hasUseful = Boolean(referee || assistantsRaw.length || attendance || events.length || homeLineup.length || awayLineup.length || /leikskýrsla|dómari|atburðir|byrjunarlið/i.test(fullText));
  return {
    available: hasUseful,
    sourceUrl: url,
    message: hasUseful ? 'Leikskýrsla var lesin úr opnum gögnum eins vel og hægt var.' : 'Leikskýrsla er ekki birt eða ekki aðgengileg í opnu HTML-gögnunum enn. Opnaðu upprunaheimild til að sjá hvort KSÍ/COMET hafi birt meira.',
    referee,
    assistants: assistantsRaw,
    attendance,
    events,
    lineups: { home: homeLineup, away: awayLineup },
    rawHints: hasUseful ? [] : lines.filter(l => /dómari|leikskýrsla|skýrsla|atburðir|byrjunarlið/i.test(l)).slice(0, 8)
  };
}

async function getMatchReport(match) {
  const urls = Array.from(new Set([match.matchReportUrl, match.sourceUrl, match.competitionUrl].filter(Boolean))).filter(url => /ksi\.is/i.test(url));
  for (const url of urls) {
    try {
      const html = await fetchText(url);
      const report = parseMatchReportHtml(html, match, url);
      if (report.available) return report;
      // Return the first honest attempt if nothing better is found later.
      if (!urls[urls.length - 1]) return report;
    } catch (_) {}
  }
  return {
    available: false,
    sourceUrl: match.sourceUrl || match.competitionUrl || '',
    message: 'Leikskýrsla/dómarar fundust ekki í opnum gögnum fyrir þennan leik enn. Þetta getur breyst þegar KSÍ/COMET birtir leikskýrslu.',
    referee: '',
    assistants: [],
    attendance: '',
    events: [],
    lineups: { home: [], away: [] },
    rawHints: []
  };
}

function teamStats(table, team) {
  return findTeamRow(table, team) || emptyTeam(team || 'Óþekkt lið');
}

function smartFacts(match, table) {
  const facts = [];
  if (table.tableType === 'official') facts.push('Þessi tafla er sótt sem opinber KSÍ staða fyrir mótið/riðilinn.');
  if (table.tableType === 'none') facts.push('KSÍ birtir ekki stöðutöflu fyrir þetta mót eins og er.');
  const home = teamStats(table, match.home);
  const away = teamStats(table, match.away);
  if (home.rank && away.rank) {
    const diff = Math.abs(home.rank - away.rank);
    if (diff <= 2) facts.push('Liðin eru nálægt hvort öðru í töflunni — þetta gæti verið mikilvægur leikur.');
    if (home.rank === 1 || away.rank === 1) facts.push('Topplið kemur við sögu í þessum leik.');
  }
  if (home.played && away.played) {
    if (home.gf > away.gf) facts.push(`${home.team} hefur skorað fleiri mörk í töflunni.`);
    if (away.ga < home.ga) facts.push(`${away.team} hefur fengið færri mörk á sig í töflunni.`);
    if (home.points === away.points) facts.push('Liðin eru jöfn að stigum í töflunni.');
  }
  if (!facts.length) facts.push('Opnaðu leikinn aftur síðar þegar fleiri úrslit eða leikskýrsla hafa skilað sér.');
  return facts;
}

function summarizeCompetitions(matches) {
  const map = new Map();
  for (const m of matches) {
    if (!m.competitionKey || !m.competition) continue;
    const item = map.get(m.competitionKey) || {
      key: m.competitionKey,
      name: m.competition,
      id: m.competitionId || '',
      url: m.competitionUrl || '',
      matchCount: 0,
      resultCount: 0,
      upcomingCount: 0,
      liveCount: 0,
      teams: new Set()
    };
    if (!item.id && m.competitionId) item.id = m.competitionId;
    if (!item.url && m.competitionUrl) item.url = m.competitionUrl;
    item.matchCount++;
    if (parseScore(m.score)) item.resultCount++;
    else item.upcomingCount++;
    if (m.status === 'í gangi') item.liveCount++;
    if (m.home) item.teams.add(m.home);
    if (m.away) item.teams.add(m.away);
    map.set(m.competitionKey, item);
  }
  return Array.from(map.values()).map(item => ({
    ...item,
    teams: Array.from(item.teams || []).sort((a, b) => a.localeCompare(b, 'is')).slice(0, 12),
    hasOfficialLink: Boolean(item.url || item.id)
  })).sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0) || b.matchCount - a.matchCount || a.name.localeCompare(b.name, 'is'));
}

module.exports = {
  SOURCES,
  FEATURED_COMPETITIONS,
  slug,
  clean,
  parseScore,
  competitionIdFromUrl,
  getAllMatches,
  buildCompetitionTable,
  getOfficialCompetitionTable,
  getBestCompetitionTable,
  summarizeCompetitions,
  teamStats,
  smartFacts,
  getMatchReport
};
