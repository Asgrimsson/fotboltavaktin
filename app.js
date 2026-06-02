const state = {
  matches: [],
  activeFilter: 'all',
  activeLeague: '',
  query: '',
  mine: [],
  favoriteLeagues: [],
  updatedAt: null,
  errors: [],
  competitions: [],
  theme: localStorage.getItem('fotboltavaktin.theme') || 'dark',
  lastSnapshot: JSON.parse(localStorage.getItem('fotboltavaktin.scoreSnapshot') || '{}'),
  installPrompt: null,
  featuredCompetitions: [],
  detailCache: new Map()};

const els = {
  cards: document.querySelector('#cards'),
  template: document.querySelector('#matchTemplate'),
  empty: document.querySelector('#emptyState'),
  status: document.querySelector('#statusStrip'),
  refresh: document.querySelector('#refreshBtn'),
  search: document.querySelector('#searchInput'),
  teams: document.querySelector('#teamsInput'),
  leagues: document.querySelector('#leaguesInput'),
  watchDashboard: document.querySelector('#watchDashboard'),
  leagueStrip: document.querySelector('#leagueStrip'),
  dialog: document.querySelector('#matchDialog'),
  detail: document.querySelector('#detailContent'),
  closeDialog: document.querySelector('#closeDialog'),
  metricNow: document.querySelector('#metricNow'),
  metricToday: document.querySelector('#metricToday'),
  metricResults: document.querySelector('#metricResults'),
  metricTotal: document.querySelector('#metricTotal'),
  competitionOverview: document.querySelector('#competitionOverview'),
  toastStack: document.querySelector('#toastStack'),
  themeBtn: document.querySelector('#themeBtn'),
  installBtn: document.querySelector('#installBtn'),
  dailyStars: document.querySelector('#dailyStars'),
  topTenDashboard: document.querySelector('#topTenDashboard'),
  matchdayDashboard: document.querySelector('#matchdayDashboard'),
  liveCenter: document.querySelector('#liveCenter')
};

function escapeHtml(value) {
  return String(value || '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
}
function fmtDate(iso) {
  if (!iso) return '';
  return new Intl.DateTimeFormat('is-IS', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Atlantic/Reykjavik' }).format(new Date(iso));
}
function fmtTime(iso, fallback) {
  if (!iso) return fallback || '';
  return new Intl.DateTimeFormat('is-IS', { hour: '2-digit', minute: '2-digit', timeZone: 'Atlantic/Reykjavik' }).format(new Date(iso));
}
function dayKey(iso, offset = 0) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Atlantic/Reykjavik', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const y = Number(parts.find(p => p.type === 'year').value);
  const m = Number(parts.find(p => p.type === 'month').value) - 1;
  const d = Number(parts.find(p => p.type === 'day').value) + offset;
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Atlantic/Reykjavik', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.UTC(y, m, d)));
}
function isSameIcelandDay(iso, offset = 0) {
  if (!iso) return false;
  const matchKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Atlantic/Reykjavik', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
  return matchKey === dayKey(iso, offset);
}
function isTodayMatch(match) {
  return isSameIcelandDay(match.startTime);
}
function isUpcomingMatch(match) {
  if (hasScore(match)) return false;
  if (!match.startTime) return match.status !== 'lokið';
  return new Date(match.startTime).getTime() >= Date.now() - 7200000;
}
function isLiveMatch(match) {
  if (hasScore(match)) return false;
  if (match.status === 'í gangi') return true;
  if (!match.startTime) return false;
  const start = new Date(match.startTime).getTime();
  const now = Date.now();
  return now >= start - 10 * 60 * 1000 && now <= start + 165 * 60 * 1000;
}
function liveMinute(match) {
  if (!match.startTime) return '';
  const min = Math.max(1, Math.floor((Date.now() - new Date(match.startTime).getTime()) / 60000) + 1);
  if (min <= 45) return `${min}. mín`;
  if (min <= 60) return 'Hálfleikur / uppbót';
  if (min <= 105) return `${Math.min(90, min - 15)}. mín`;
  return 'Líklega að ljúka';
}
function normalizeTeamsInput(value) { return value.split(',').map(s => s.trim()).filter(Boolean); }
function includesAnyTeam(match, teams) {
  if (!teams.length) return false;
  const hay = `${match.home} ${match.away}`.toLowerCase();
  return teams.some(team => hay.includes(team.toLowerCase().trim()));
}
function includesAnyLeague(match, leagues) {
  if (!leagues.length) return false;
  const hay = `${match.competition || ''} ${match.competitionKey || ''}`.toLowerCase();
  return leagues.some(league => hay.includes(league.toLowerCase().trim()));
}
function isWatchMatch(match) {
  return includesAnyTeam(match, state.mine) || includesAnyLeague(match, state.favoriteLeagues);
}
function shortDateTime(match) {
  return [fmtDate(match.startTime), fmtTime(match.startTime, match.localTime || match.rawTime)].filter(Boolean).join(' ');
}
function smartCardText(match) {
  const bits = [];
  if (isLiveMatch(match)) bits.push(`Leikur er í gangi núna · ${liveMinute(match)}.`);
  if (hasScore(match)) bits.push(`Úrslit/stada: ${match.score}.`);
  if (isWatchMatch(match)) bits.push('Passar við Mína vakt.');
  if (match.competition) bits.push(match.competition);
  return bits.slice(0, 3).join(' · ');
}
function hasScore(match) { return /\d+\s*[-:]\s*\d+/.test(match.score || ''); }
function pillClass(status) {
  if (status === 'í gangi') return 'live';
  if (status === 'á eftir') return 'soon';
  if (status === 'lokið') return 'done';
  return '';
}

function isLowerLeagueMatch(match) {
  const text = `${match.competition || ''} ${match.home || ''} ${match.away || ''}`.toLowerCase();
  if (/besta\s+deild|lengjudeild/i.test(text)) return false;
  if (/kvenna/i.test(text)) return false;
  if (/(^|\s)(2|3|4|5)\.??\s*flokkur(\s|$)|u\s?\d{1,2}|\b[0-9]{1,2}\s*ára\b|yngri|drengir|stúlkur/i.test(text)) return false;
  return /(^|\s)(2|3|4|5)\.??\s*deild\s+karla/i.test(text);
}

function visibleMatches() {
  return state.matches.filter(isLowerLeagueMatch);
}

function getFilteredMatches() {
  const q = state.query.toLowerCase().trim();
  let items = visibleMatches();
  if (state.activeFilter === 'now') items = items.filter(isLiveMatch);
  if (state.activeFilter === 'today') items = items.filter(isTodayMatch);
  if (state.activeFilter === 'upcoming') items = items.filter(isUpcomingMatch).slice(0, 80);
  if (state.activeFilter === 'results') items = items.filter(hasScore);
  if (state.activeFilter === 'mine') items = items.filter(m => includesAnyTeam(m, state.mine));
  if (state.activeFilter === 'watch') items = items.filter(isWatchMatch);
  if (state.activeLeague) items = items.filter(m => (m.competitionKey || '') === state.activeLeague);
  if (q) items = items.filter(m => `${m.home} ${m.away} ${m.venue} ${m.competition} ${m.source} ${m.score}`.toLowerCase().includes(q));
  return items;
}

function renderStatus() {
  const updated = state.updatedAt ? new Intl.DateTimeFormat('is-IS', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Atlantic/Reykjavik' }).format(new Date(state.updatedAt)) : 'óþekkt';
  const v = visibleMatches();
  const live = v.filter(isLiveMatch).length;
  const next = v.filter(isUpcomingMatch).length;
  const extra = state.errors.length ? `<span>Viðvörun: ${state.errors.length} heimild gaf ekki full gögn</span>` : '';
  els.status.innerHTML = `<span>Síðast uppfært ${updated}</span><span>Aðalheimild: KSÍ</span><span>Sjálfvirk live-vakt</span><span>${live} leikir í gangi</span><span>${next} næstu leikir</span><span>Engin handvirk lið/deildir</span>${extra}`;
}
function renderMetrics() {
  const v = visibleMatches();
  els.metricNow.textContent = v.filter(isLiveMatch).length;
  els.metricToday.textContent = v.filter(isTodayMatch).length;
  els.metricResults.textContent = v.filter(hasScore).length;
  els.metricTotal.textContent = v.length;
}
function renderLeagues() {
  const counts = new Map();
  for (const m of visibleMatches()) {
    if (!m.competitionKey || !m.competition) continue;
    const row = counts.get(m.competitionKey) || { key: m.competitionKey, name: m.competition, count: 0 };
    row.count++;
    counts.set(m.competitionKey, row);
  }
  const items = Array.from(counts.values()).sort((a, b) => a.name.localeCompare(b.name, 'is'));
  if (!items.length) { els.leagueStrip.innerHTML = ''; return; }

  const currentLabel = state.activeLeague
    ? (items.find(item => item.key === state.activeLeague)?.name || 'Valin deild')
    : 'Allar deildir';

  els.leagueStrip.innerHTML = `
    <label class="league-select-label" for="leagueSelect">
      <span>Deild / riðill</span>
      <select id="leagueSelect" class="league-select">
        <option value="">Allar deildir (${visibleMatches().length})</option>
        ${items.map(item => `<option value="${escapeHtml(item.key)}" ${state.activeLeague === item.key ? 'selected' : ''}>${escapeHtml(item.name)} (${item.count})</option>`).join('')}
      </select>
    </label>
    <button class="mini-btn clear-league ${state.activeLeague ? '' : 'hidden'}" type="button">Hreinsa val</button>
    <span class="league-current">Sýni: <b>${escapeHtml(currentLabel)}</b></span>
  `;

  const select = els.leagueStrip.querySelector('#leagueSelect');
  select.addEventListener('change', event => {
    state.activeLeague = event.target.value;
    render();
  });
  const clear = els.leagueStrip.querySelector('.clear-league');
  if (clear) clear.addEventListener('click', () => {
    state.activeLeague = '';
    render();
  });
}
function renderCards() {
  let items = getFilteredMatches();
  const fullCount = items.length;
  // Vefurinn heldur aðallistanum stuttum: topp 10 nema notandi sé að leita eða opna ákveðna deild.
  const shouldLimit = !state.query && !state.activeLeague && ['today','now','upcoming'].includes(state.activeFilter);
  if (shouldLimit) items = items.slice(0, 10);
  els.cards.innerHTML = '';
  els.empty.classList.toggle('hidden', items.length > 0);
  if (fullCount > items.length) {
    const note = document.createElement('div');
    note.className = 'list-note';
    note.innerHTML = `<strong>Sýni topp 10</strong><span>${fullCount} leikir passa við valið.</span><button class="mini-btn" type="button" data-show-all="1">Sýna alla leiki</button>`;
    els.cards.appendChild(note);
    const btn = note.querySelector('[data-show-all]');
    if (btn) btn.addEventListener('click', () => { state.activeFilter = 'all'; state.activeLeague = ''; state.query = ''; if (els.search) els.search.value = ''; render(); els.cards.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  }
  items.forEach(match => {
    const node = els.template.content.cloneNode(true);
    const card = node.querySelector('.match-card');
    const open = node.querySelector('.match-open');
    const detailBtn = node.querySelector('.detail-btn');
    node.querySelector('.status-pill').textContent = isLiveMatch(match) ? `LIVE · ${liveMinute(match)}` : (match.status || 'á dagskrá');
    node.querySelector('.status-pill').classList.add(isLiveMatch(match) ? 'live' : pillClass(match.status));
    node.querySelector('.time').textContent = fmtTime(match.startTime, match.localTime || match.rawTime);
    node.querySelector('.date').textContent = fmtDate(match.startTime) || match.dateLabel || '';
    node.querySelector('.home').textContent = match.home;
    node.querySelector('.away').textContent = match.away;
    node.querySelector('.score-inline').textContent = hasScore(match) ? ` ${match.score} ` : '';
    const meta = [match.competition, match.venue].filter(Boolean).join(' · ');
    const metaEl = node.querySelector('.meta');
    metaEl.textContent = meta || 'Nánari upplýsingar ekki tiltækar';
    card.classList.toggle('is-live-card', isLiveMatch(match));
    card.classList.toggle('has-score-card', hasScore(match));
    card.setAttribute('aria-label', `${match.home} gegn ${match.away}. Opna Match Center.`);
    if (isWatchMatch(match)) card.classList.add('watch-hit');
    const smart = smartCardText(match);
    if (smart) metaEl.textContent = `${meta || 'Nánari upplýsingar'} · ${smart}`;
    node.querySelector('.source').textContent = match.source || 'Heimild';
    node.querySelector('.source-link').href = match.sourceUrl || '#';
    open.addEventListener('click', () => openMatch(match.id));
    detailBtn.addEventListener('click', () => openMatch(match.id));
    card.dataset.id = match.id;
    els.cards.appendChild(node);
  });
}
function syncActiveTabs() {
  document.querySelectorAll('.controls .tab').forEach(b => b.classList.toggle('active', b.dataset.filter === state.activeFilter));
}
function render() { syncActiveTabs(); renderStatus(); renderMetrics(); renderLiveCenter(); renderMatchday(); renderTopTen(); renderDailyStars(); renderLeagues(); renderCompetitions(); renderCards(); }

function formIcon(value) {
  const v = String(value || '').toUpperCase();
  if (v === 'W' || v === 'U') return '<span class="form win">U</span>';
  if (v === 'D' || v === 'J') return '<span class="form draw">J</span>';
  if (v === 'L' || v === 'T') return '<span class="form loss">T</span>';
  return '';
}
function statBox(title, value, hint = '') { return `<article class="stat-box"><span>${escapeHtml(title)}</span><strong>${escapeHtml(value)}</strong>${hint ? `<small>${escapeHtml(hint)}</small>` : ''}</article>`; }
function teamPanel(label, stats) {
  return `<section class="team-panel">
    <p class="panel-label">${escapeHtml(label)}</p>
    <h3>${escapeHtml(stats.team)}</h3>
    <div class="mini-stats">
      ${statBox('Sæti', stats.rank || '—')}
      ${statBox('Stig', stats.points ?? 0)}
      ${statBox('Skoruð', stats.gf ?? 0, `${stats.avgFor || 0} að meðaltali`)}
      ${statBox('Fengin', stats.ga ?? 0, `${stats.avgAgainst || 0} að meðaltali`)}
    </div>
    <div class="form-row">${(stats.form || []).map(formIcon).join('') || '<span class="muted">Engin úrslit fundust</span>'}</div>
  </section>`;
}
function sourceBadge(table) {
  if (table.tableType === 'official') return '<span class="source-badge official">Opinber KSÍ tafla</span>';
  if (table.tableType === 'none') return '<span class="source-badge none">Engin tafla hjá KSÍ</span>';
  if (table.tableType === 'fallback') return '<span class="source-badge fallback">Varatafla</span>';
  return '<span class="source-badge calculated">Reiknuð tafla</span>';
}
function tableMarkup(table, home, away) {
  const badge = sourceBadge(table || {});
  if (!table.rows?.length) {
    const fallback = table.fallbackRows?.length ? `<details class="fallback-details"><summary>Sýna reiknaða varatöflu úr leikjalista</summary>${tableMarkup({ ...table, rows: table.fallbackRows, tableType: 'calculated', sourceNote: 'Varatafla úr leikjalistanum.' }, home, away)}</details>` : '';
    return `${badge}<p class="muted">${escapeHtml(table.sourceNote || 'Engin tafla fannst fyrir þetta mót.')}</p>${fallback}`;
  }
  const rows = table.rows.map(r => {
    const highlight = [home, away].some(t => String(t || '').toLowerCase() === String(r.team || '').toLowerCase());
    const form = (r.form || []).map(formIcon).join('');
    return `<tr class="${highlight ? 'highlight' : ''}">
      <td>${r.rank}</td><td>${escapeHtml(r.team)}</td><td>${r.played}</td><td>${r.won}</td><td>${r.drawn}</td><td>${r.lost}</td><td>${r.gf}:${r.ga}</td><td>${r.gd > 0 ? '+' : ''}${r.gd}</td><td><strong>${r.points}</strong></td><td>${form}</td>
    </tr>`;
  }).join('');
  const sourceLink = table.sourceUrl ? `<a href="${escapeHtml(table.sourceUrl)}" target="_blank" rel="noopener noreferrer">Opna KSÍ mótasíðu</a>` : '';
  return `${badge}<div class="table-wrap"><table class="standings"><thead><tr><th>#</th><th>Lið</th><th>L</th><th>U</th><th>J</th><th>T</th><th>Mörk</th><th>+/-</th><th>Stig</th><th>Form</th></tr></thead><tbody>${rows}</tbody></table></div><p class="data-note">${escapeHtml(table.sourceNote || '')} ${sourceLink}</p>`;
}

function scoreNumbers(match) {
  const m = String(match.score || '').match(/(\d{1,2})\s*[-:]\s*(\d{1,2})/);
  return m ? { home: Number(m[1]), away: Number(m[2]) } : null;
}
function rowForTeam(table, team) {
  const rows = table?.rows || [];
  const want = String(team || '').toLowerCase();
  return rows.find(r => String(r.team || '').toLowerCase() === want)
    || rows.find(r => String(r.team || '').toLowerCase().includes(want) || want.includes(String(r.team || '').toLowerCase()))
    || null;
}
function pointsFromForm(form = []) {
  return form.reduce((sum, x) => {
    const v = String(x || '').toUpperCase();
    if (v === 'U' || v === 'W') return sum + 3;
    if (v === 'J' || v === 'D') return sum + 1;
    return sum;
  }, 0);
}
function h2hForMatch(match) {
  const h = String(match.home || '').toLowerCase();
  const a = String(match.away || '').toLowerCase();
  const rows = visibleMatches().filter(m => {
    const mh = String(m.home || '').toLowerCase();
    const ma = String(m.away || '').toLowerCase();
    return ((mh === h && ma === a) || (mh === a && ma === h)) && scoreNumbers(m);
  }).slice(0, 8);
  let homeWins = 0, awayWins = 0, draws = 0, goalsHome = 0, goalsAway = 0;
  for (const r of rows) {
    const sc = scoreNumbers(r);
    const direct = String(r.home || '').toLowerCase() === h;
    const hg = direct ? sc.home : sc.away;
    const ag = direct ? sc.away : sc.home;
    goalsHome += hg; goalsAway += ag;
    if (hg > ag) homeWins++; else if (ag > hg) awayWins++; else draws++;
  }
  return { rows, homeWins, awayWins, draws, goalsHome, goalsAway };
}
function intelligenceLabel(home, away) {
  if (!home?.rank || !away?.rank) return 'Gögn að safnast';
  const diff = Math.abs(Number(home.rank) - Number(away.rank));
  if (home.rank <= 3 && away.rank <= 3) return 'Toppslagur';
  if (diff <= 2) return 'Jafn leikur';
  if ((home.rank <= 2 && away.rank >= 6) || (away.rank <= 2 && home.rank >= 6)) return 'Styrkleikamunur';
  return 'Áhugaverður leikur';
}
function avg(n, d) { return d ? (Number(n || 0) / d).toFixed(1) : '0.0'; }
function matchIntelligenceMarkup(data) {
  const m = data.match;
  const home = data.teamStats.home;
  const away = data.teamStats.away;
  const h2h = h2hForMatch(m);
  const homePlayed = Number(home.played || 0);
  const awayPlayed = Number(away.played || 0);
  const hForm = pointsFromForm(home.form || []);
  const aForm = pointsFromForm(away.form || []);
  const label = intelligenceLabel(home, away);
  const h2hRows = h2h.rows.length ? h2h.rows.map(r => `<button class="league-match-row" type="button" data-id="${escapeHtml(r.id)}"><b>${escapeHtml(r.home)} ${escapeHtml(r.score)} ${escapeHtml(r.away)}</b><span>${escapeHtml(shortDateTime(r))} · ${escapeHtml(r.competition || '')}</span></button>`).join('') : '<p class="muted">Engar eldri viðureignir fundust í sóttum gögnum.</p>';
  const facts = [];
  if (home.rank && away.rank) facts.push(`${home.team} er í ${home.rank}. sæti og ${away.team} í ${away.rank}. sæti.`);
  if (homePlayed && awayPlayed) facts.push(`${home.team}: ${avg(home.gf, homePlayed)} mörk í leik · ${avg(home.ga, homePlayed)} fengin. ${away.team}: ${avg(away.gf, awayPlayed)} mörk í leik · ${avg(away.ga, awayPlayed)} fengin.`);
  if (hForm !== aForm) facts.push(`Form síðustu leikja gefur ${hForm > aForm ? home.team : away.team} forskot miðað við þau gögn sem fundust.`);
  if (!facts.length) facts.push('Það vantar enn nægileg opinber gögn til að gera sterka leikgreiningu.');
  return `
    <section class="intelligence-card">
      <div class="section-heading compact-heading"><div><p class="eyebrow">Match Intelligence</p><h3>${escapeHtml(label)}</h3></div><span>v1.0</span></div>
      <div class="intelligence-grid">
        <article><span>Form ${escapeHtml(home.team)}</span><strong>${hForm} stig</strong><div class="form-row">${(home.form || []).map(formIcon).join('') || '<span class="muted">—</span>'}</div></article>
        <article><span>Form ${escapeHtml(away.team)}</span><strong>${aForm} stig</strong><div class="form-row">${(away.form || []).map(formIcon).join('') || '<span class="muted">—</span>'}</div></article>
        <article><span>Sókn ${escapeHtml(home.team)}</span><strong>${avg(home.gf, homePlayed)}</strong><small>mörk í leik</small></article>
        <article><span>Sókn ${escapeHtml(away.team)}</span><strong>${avg(away.gf, awayPlayed)}</strong><small>mörk í leik</small></article>
      </div>
      <div class="analysis-box">${facts.map(f => `<p>🤖 ${escapeHtml(f)}</p>`).join('')}</div>
      <details class="h2h-box"><summary>Head-to-Head úr sóttum gögnum · ${h2h.rows.length} leikir</summary>
        <div class="h2h-summary"><b>${escapeHtml(m.home)}</b> ${h2h.homeWins} sigrar · ${h2h.draws} jafntefli · <b>${escapeHtml(m.away)}</b> ${h2h.awayWins} sigrar · mörk ${h2h.goalsHome}:${h2h.goalsAway}</div>
        ${h2hRows}
      </details>
    </section>`;
}

function getFeaturedMeta(key) {
  return state.featuredCompetitions.find(c => c.key === key) || state.competitions.find(c => c.key === key) || null;
}
function setFilter(filter) {
  state.activeFilter = filter;
  state.activeLeague = state.activeLeague || '';
  render();
  const target = filter === 'now' ? (els.liveCenter || els.cards) : els.cards;
  if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderLiveCenter() {
  if (!els.liveCenter) return;
  const all = visibleMatches();
  const live = all.filter(isLiveMatch).sort((a,b)=>(new Date(a.startTime || 0))-(new Date(b.startTime || 0)));
  const next = all.filter(isUpcomingMatch).sort((a,b)=>(new Date(a.startTime || 0))-(new Date(b.startTime || 0))).slice(0, 6);
  const today = all.filter(isTodayMatch).length;
  const cards = live.length ? live : next;
  els.liveCenter.innerHTML = `
    <div class="section-heading live-heading"><div><p class="eyebrow">Sjálfvirk Live Center v2.4</p><h2>${live.length ? `${live.length} leikir í gangi núna` : 'Enginn leikur í gangi núna'}</h2></div><span>${live.length ? 'smelltu á live leik til að opna Match Center' : `${today} leikir í dag · næstu leikir birtast hér þar til live hefst`}</span></div>
    <div class="live-grid ${live.length ? '' : 'is-empty'}">
      ${cards.length ? cards.map(m => `<button class="live-card ${live.length ? 'is-live' : 'next-live'}" type="button" data-id="${escapeHtml(m.id)}">
        <span class="live-dot">${live.length ? `● LIVE · ${escapeHtml(liveMinute(m))}` : `⏱ Næsti leikur · ${escapeHtml(shortDateTime(m))}`}</span>
        <strong>${escapeHtml(m.home)} – ${escapeHtml(m.away)}</strong>
        <small>${escapeHtml(fmtTime(m.startTime, m.localTime || m.rawTime))} · ${escapeHtml(m.competition || '')} · ${escapeHtml(m.venue || '')}</small>
      </button>`).join('') : `<article class="live-card live-empty-card"><span class="live-dot">● Live</span><strong>Engir komandi leikir fundust í sóttum KSÍ-gögnum</strong><small>Ýttu á Uppfæra eða prófaðu aftur síðar. Engin handvirk lið/deildir þarf að velja.</small></article>`}
    </div>`;
  els.liveCenter.querySelectorAll('[data-id]').forEach(btn => btn.addEventListener('click', () => openMatch(btn.dataset.id)));
}

function renderMatchday() {
  if (!els.matchdayDashboard) return;
  const today = visibleMatches().filter(isTodayMatch);
  const live = today.filter(isLiveMatch);
  const results = today.filter(hasScore);
  const lowerToday = today;
  const next = today.filter(isUpcomingMatch).sort((a,b)=>(new Date(a.startTime || 0))-(new Date(b.startTime || 0)))[0];
  const title = today.length ? `${today.length} leikir í dag` : 'Engir leikir í dag í sóttum gögnum';
  els.matchdayDashboard.innerHTML = `
    <div class="section-heading"><div><p class="eyebrow">Leikdagur v2.4</p><h2>${escapeHtml(title)}</h2></div><span>2.–5. deild karla · fullorðinslið</span></div>
    <div class="matchday-grid">
      <button class="metric action-metric" type="button" data-jump-filter="now"><strong>${live.length}</strong><span>í gangi</span></button>
      <button class="metric action-metric" type="button" data-jump-filter="today"><strong>${today.length}</strong><span>í dag</span></button>
      <button class="metric action-metric" type="button" data-jump-filter="results"><strong>${results.length}</strong><span>úrslit í dag</span></button>
      <button class="metric action-metric" type="button" data-jump-filter="upcoming"><strong>${lowerToday.length}</strong><span>í neðri deildum</span></button>
    </div>
    ${next ? `<button class="next-kickoff" type="button" data-id="${escapeHtml(next.id)}"><b>Næsti leikur:</b> ${escapeHtml(next.home)} – ${escapeHtml(next.away)} · ${escapeHtml(fmtTime(next.startTime, next.localTime || next.rawTime))}</button>` : ''}`;
  els.matchdayDashboard.querySelectorAll('[data-jump-filter]').forEach(btn => btn.addEventListener('click', () => setFilter(btn.dataset.jumpFilter)));
  els.matchdayDashboard.querySelectorAll('[data-id]').forEach(btn => btn.addEventListener('click', () => openMatch(btn.dataset.id)));
}
function renderTopTen() {
  if (!els.topTenDashboard) return;
  const list = visibleMatches()
    .filter(m => isLiveMatch(m) || isTodayMatch(m) || isUpcomingMatch(m))
    .sort((a, b) => Number(isLiveMatch(b)) - Number(isLiveMatch(a)) || Number(isWatchMatch(b)) - Number(isWatchMatch(a)) || ((new Date(a.startTime || 0)) - (new Date(b.startTime || 0))))
    .slice(0, 10);
  if (!list.length) { els.topTenDashboard.innerHTML = ''; return; }
  els.topTenDashboard.innerHTML = `
    <div class="section-heading"><div><p class="eyebrow">Sjálfvirkt toppval v2.4</p><h2>Top 10 leikir</h2></div><span>live + næstu leikir fyrst</span></div>
    <div class="topten-list">${list.map((m, i) => `
      <button class="topten-item" type="button" data-id="${escapeHtml(m.id)}">
        <b>${i + 1}. ${escapeHtml(m.home)} – ${escapeHtml(m.away)}</b>
        <span>${escapeHtml(fmtTime(m.startTime, m.localTime || m.rawTime))} · ${escapeHtml(m.status || '')} · ${escapeHtml(m.competition || '')}</span>
      </button>`).join('')}</div>`;
  els.topTenDashboard.querySelectorAll('[data-id]').forEach(btn => btn.addEventListener('click', () => openMatch(btn.dataset.id)));
}

function normalizeText(value) { return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }

function renderDailyStars() {
  if (!els.dailyStars) return;
  const today = visibleMatches().filter(isTodayMatch);
  const live = today.filter(isLiveMatch);
  const scored = today.filter(hasScore).sort((a, b) => {
    const sa = scoreNumbers(a); const sb = scoreNumbers(b);
    return ((sb?.home || 0) + (sb?.away || 0)) - ((sa?.home || 0) + (sa?.away || 0));
  });
  const watch = today.filter(isWatchMatch);
  const upcoming = today.filter(m => !hasScore(m) && m.status !== 'líklega lokið');
  const pick = live[0] || watch[0] || upcoming[0] || today[0] || visibleMatches()[0];
  if (!pick) { els.dailyStars.innerHTML = ''; return; }
  const highScore = scored[0];
  const leagueCounts = new Map();
  for (const m of today) {
    if (!m.competition) continue;
    leagueCounts.set(m.competition, (leagueCounts.get(m.competition) || 0) + 1);
  }
  const busyLeague = Array.from(leagueCounts.entries()).sort((a,b)=>b[1]-a[1])[0];
  els.dailyStars.innerHTML = `
    <div class="section-heading"><div><p class="eyebrow">Fótboltamiðstöðin v2.4</p><h2>Stjörnur dagsins</h2></div><span>neðri deildir karla · smelltu á Live núna</span></div>
    <div class="stars-grid">
      <button class="star-card main-star" type="button" data-id="${escapeHtml(pick.id)}"><span>⭐ Leikur dagsins</span><strong>${escapeHtml(pick.home)} – ${escapeHtml(pick.away)}</strong><small>${escapeHtml(shortDateTime(pick))} · ${escapeHtml(pick.competition || '')}</small></button>
      <button class="star-card" type="button" data-jump-filter="now"><span>⚡ Live núna</span><strong>${live.length}</strong><small>${live.length ? 'smelltu til að sjá leikina' : 'enginn leikur í gangi núna'}</small></button>
      <article class="star-card"><span>🎯 Markaleikur</span><strong>${highScore ? escapeHtml(`${highScore.home} ${highScore.score} ${highScore.away}`) : '—'}</strong><small>${highScore ? escapeHtml(highScore.competition || '') : 'Engin úrslit í dag enn'}</small></article>
      <article class="star-card"><span>🏆 Mest virk deild</span><strong>${busyLeague ? escapeHtml(busyLeague[0]) : '—'}</strong><small>${busyLeague ? `${busyLeague[1]} leikir í dag` : 'Engin deild fundin'}</small></article>
    </div>`;
  els.dailyStars.querySelectorAll('[data-id]').forEach(btn => btn.addEventListener('click', () => openMatch(btn.dataset.id)));
  els.dailyStars.querySelectorAll('[data-jump-filter]').forEach(btn => btn.addEventListener('click', () => setFilter(btn.dataset.jumpFilter)));
}


function renderWatchDashboard() {
  if (!els.watchDashboard) return;
  const watch = visibleMatches().filter(isWatchMatch);
  const today = watch.filter(isTodayMatch);
  const live = watch.filter(isLiveMatch);
  const next = watch.filter(isUpcomingMatch).slice(0, 5);
  if (!state.mine.length && !state.favoriteLeagues.length) {
    els.watchDashboard.innerHTML = `<div class="watch-empty"><strong>Settu upp Mína vakt</strong><span>Skrifaðu lið og/eða deildir í reitina hér fyrir ofan. Þá færðu persónulegt yfirlit hér.</span></div>`;
    return;
  }
  els.watchDashboard.innerHTML = `
    <div class="section-heading compact-heading"><div><p class="eyebrow">v2.4</p><h2>Mín vakt</h2></div><span>${watch.length} leikir passa við valið þitt</span></div>
    <div class="watch-grid">
      <article class="watch-card live"><strong>${live.length}</strong><span>í gangi hjá mínum liðum/deildum</span></article>
      <article class="watch-card"><strong>${today.length}</strong><span>í dag í minni vakt</span></article>
      <article class="watch-card"><strong>${next.length}</strong><span>næstu leikir</span></article>
    </div>
    <div class="watch-next">${next.length ? next.map(m => `<button class="watch-next-item" type="button" data-id="${escapeHtml(m.id)}"><b>${escapeHtml(m.home)} – ${escapeHtml(m.away)}</b><span>${escapeHtml(shortDateTime(m))} · ${escapeHtml(m.competition || '')}</span></button>`).join('') : '<p class="muted">Engir næstu leikir fundust fyrir þessa vakt.</p>'}</div>`;
  els.watchDashboard.querySelectorAll('[data-id]').forEach(btn => btn.addEventListener('click', () => openMatch(btn.dataset.id)));
}

function renderCompetitions() {
  if (!els.competitionOverview) return;
  let items = state.competitions.length ? state.competitions : Array.from(new Map(visibleMatches().map(m => [m.competitionKey, { key: m.competitionKey, name: m.competition, matchCount: 1, resultCount: hasScore(m) ? 1 : 0, upcomingCount: hasScore(m) ? 0 : 1, liveCount: isLiveMatch(m) ? 1 : 0, hasOfficialLink: Boolean(m.competitionUrl), url: m.competitionUrl, id: m.competitionId }])).values()).filter(x => x.key && x.name);
  items = items.filter(item => /(^|\s)(2|3|4|5)\.??\s*deild\s+karla/i.test(item.name || '') && !/besta\s+deild|lengjudeild|flokkur|kvenna/i.test(item.name || ''));
  if (!items.length) { els.competitionOverview.innerHTML = ''; return; }
  els.competitionOverview.innerHTML = `
    <div class="section-heading"><div><p class="eyebrow">v2.4</p><h2>Neðri deildir</h2></div><span>${items.length} mót/riðlar fundust</span></div>
    <div class="competition-grid">${items.slice(0, 18).map(item => `
      <article class="competition-card">
        <div><h3>${escapeHtml(item.name)}</h3><p>${item.matchCount || 0} leikir · ${item.resultCount || 0} úrslit · ${item.upcomingCount || 0} framundan</p></div>
        <div class="competition-actions">
          <span class="source-badge ${item.hasOfficialLink ? 'official' : 'calculated'}">${item.hasOfficialLink ? 'KSÍ tenging' : 'varatafla'}</span>
          <button class="mini-btn competition-open" type="button" data-key="${escapeHtml(item.key)}" data-name="${escapeHtml(item.name)}" data-url="${escapeHtml(item.url || '')}" data-id="${escapeHtml(item.id || '')}">Opna deild</button>
          <button class="mini-btn league-fav" type="button" data-name="${escapeHtml(item.name)}">+ Mín vakt</button>
        </div>
      </article>`).join('')}</div>`;
  els.competitionOverview.querySelectorAll('.competition-open').forEach(btn => btn.addEventListener('click', () => openCompetition(btn.dataset)));
  els.competitionOverview.querySelectorAll('.league-fav').forEach(btn => btn.addEventListener('click', () => {
    const name = btn.dataset.name;
    if (name && !state.favoriteLeagues.some(x => x.toLowerCase() === name.toLowerCase())) state.favoriteLeagues.push(name);
    localStorage.setItem('fotboltavaktin.leagues', JSON.stringify(state.favoriteLeagues));
    if (els.leagues) els.leagues.value = state.favoriteLeagues.join(', ');
    render();
  }));
}
function setDetailTab(name) {
  els.detail.querySelectorAll('[data-panel]').forEach(p => p.classList.toggle('hidden', p.dataset.panel !== name));
  els.detail.querySelectorAll('[data-detail-tab]').forEach(b => b.classList.toggle('active', b.dataset.detailTab === name));
}

function quickMatchMarkup(m) {
  return `
    <header class="detail-hero compact-detail-hero">
      <span class="status-pill ${isLiveMatch(m) ? 'live' : pillClass(m.status)}">${escapeHtml(isLiveMatch(m) ? 'í gangi' : (m.status || 'á dagskrá'))}</span>
      <h2>${escapeHtml(m.home)} <span>${escapeHtml(m.score || '–')}</span> ${escapeHtml(m.away)}</h2>
      <p>${escapeHtml(m.competition || 'Óþekkt keppni')} · ${escapeHtml(m.venue || 'Völlur ekki skráður')} · ${escapeHtml(fmtDate(m.startTime) || m.dateLabel || '')} ${escapeHtml(fmtTime(m.startTime, m.localTime || m.rawTime))}</p>
    </header>
    <div class="instant-match-panel">
      <div>
        <p class="eyebrow">Hraðopnun</p>
        <h3>Match Center opnað strax</h3>
        <p>Grunngögn leiksins eru komin. Sæki töflu, liðatölfræði og leikskýrslu í bakgrunni…</p>
      </div>
      <div class="loading-spinner" aria-hidden="true"></div>
    </div>
    <div class="fact-list">
      ${isLiveMatch(m) ? `<p>🔴 Leikur er líklega í gangi · ${escapeHtml(liveMinute(m))}</p>` : ''}
      ${m.sourceUrl ? `<p>🔗 <a href="${escapeHtml(m.sourceUrl)}" target="_blank" rel="noopener noreferrer">Opna KSÍ heimild</a></p>` : ''}
    </div>`;
}
function renderMatchDetail(data) {
  const m = data.match;
  const homeStats = data.teamStats?.home || { team: m.home };
  const awayStats = data.teamStats?.away || { team: m.away };
  els.detail.innerHTML = `
      <header class="detail-hero compact-detail-hero">
        <span class="status-pill ${isLiveMatch(m) ? 'live' : pillClass(m.status)}">${escapeHtml(isLiveMatch(m) ? `LIVE · ${liveMinute(m)}` : (m.status || 'á dagskrá'))}</span>
        <h2>${escapeHtml(m.home)} <span>${escapeHtml(m.score || '–')}</span> ${escapeHtml(m.away)}</h2>
        <p>${escapeHtml(m.competition || 'Óþekkt keppni')} · ${escapeHtml(m.venue || 'Völlur ekki skráður')} · ${escapeHtml(fmtDate(m.startTime) || m.dateLabel || '')} ${escapeHtml(fmtTime(m.startTime, m.localTime || m.rawTime))}</p>
      </header>
      <nav class="detail-tabs">
        <button class="tab active" data-detail-tab="overview">Yfirlit</button>
        <button class="tab" data-detail-tab="table">Tafla</button>
        <button class="tab" data-detail-tab="stats">Liðatölfræði</button>
        <button class="tab" data-detail-tab="intelligence">Greining</button>
        <button class="tab" data-detail-tab="report">Leikskýrsla</button>
      </nav>
      <section data-panel="overview">
        <div class="fact-list">${(data.smartFacts || []).map(f => `<p>💡 ${escapeHtml(f)}</p>`).join('') || '<p>💡 Grunngögn leiksins eru sótt.</p>'}</div>
        ${matchIntelligenceMarkup(data)}
        <div class="two-col">${teamPanel('Heimalið', homeStats)}${teamPanel('Útilið', awayStats)}</div>
        <a class="big-link" href="${escapeHtml(m.sourceUrl || '#')}" target="_blank" rel="noopener noreferrer">Opna upprunaheimild</a>
      </section>
      <section data-panel="table" class="hidden">
        <h3>${escapeHtml(data.table?.competition || 'Tafla')}</h3>
        ${tableMarkup(data.table || {}, m.home, m.away)}
      </section>
      <section data-panel="stats" class="hidden">
        <div class="two-col">${teamPanel('Heimalið', homeStats)}${teamPanel('Útilið', awayStats)}</div>
        <div class="compare-bar"><span style="width:${Math.min(100, Math.max(5, (homeStats.gf || 0) * 8))}%"></span></div>
        <p class="data-note">Skoruð mörk og fengin mörk koma úr opinberri KSÍ töflu ef hún fannst, annars úr reiknaðri varatöflu.</p>
      </section>
      <section data-panel="intelligence" class="hidden">
        ${matchIntelligenceMarkup(data)}
      </section>
      <section data-panel="report" class="hidden">
        ${reportMarkup(data.report, m)}
      </section>`;
  els.detail.querySelectorAll('[data-detail-tab]').forEach(btn => btn.addEventListener('click', () => setDetailTab(btn.dataset.detailTab)));
  els.detail.querySelectorAll('.h2h-box [data-id]').forEach(btn => btn.addEventListener('click', () => openMatch(btn.dataset.id)));
  setupDetailSwipe();
}
async function openMatch(id) {
  const localMatch = state.matches.find(m => m.id === id);
  if (!id || !localMatch) {
    if (!els.dialog.open) els.dialog.showModal();
    els.detail.innerHTML = '<div class="loading error">Leikurinn fannst ekki í núverandi gagnalista. Ýttu á Uppfæra og reyndu aftur.</div>';
    return;
  }
  if (!els.dialog.open) els.dialog.showModal();

  const cached = state.detailCache.get(id);
  if (cached && Date.now() - cached.time < 120000) {
    renderMatchDetail(cached.data);
    return;
  }

  els.detail.innerHTML = localMatch ? quickMatchMarkup(localMatch) : '<div class="loading">Sæki Match Center…</div>';

  try {
    const res = await fetch(`/.netlify/functions/match-detail?id=${encodeURIComponent(id)}`, { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || 'Tókst ekki að sækja leik');
    state.detailCache.set(id, { time: Date.now(), data });
    renderMatchDetail(data);
  } catch (err) {
    const message = `<div class="loading error">${escapeHtml(err.message)}</div>`;
    els.detail.innerHTML = localMatch ? quickMatchMarkup(localMatch) + message : message;
  }
}

function buildCompetitionsFromMatches(matches) {
  const map = new Map();
  for (const m of matches || []) {
    if (!m.competitionKey || !m.competition) continue;
    const item = map.get(m.competitionKey) || { key: m.competitionKey, name: m.competition, id: m.competitionId || '', url: m.competitionUrl || '', matchCount: 0, resultCount: 0, upcomingCount: 0, liveCount: 0, hasOfficialLink: Boolean(m.competitionUrl || m.competitionId) };
    item.matchCount++;
    if (hasScore(m)) item.resultCount++; else item.upcomingCount++;
    if (isLiveMatch(m)) item.liveCount++;
    if (!item.url && m.competitionUrl) item.url = m.competitionUrl;
    if (!item.id && m.competitionId) item.id = m.competitionId;
    item.hasOfficialLink = Boolean(item.url || item.id);
    map.set(m.competitionKey, item);
  }
  return Array.from(map.values()).sort((a, b) => b.matchCount - a.matchCount || a.name.localeCompare(b.name, 'is'));
}
async function loadCompetitions() {
  try {
    const res = await fetch('/.netlify/functions/competitions', { cache: 'no-store' });
    const data = await res.json();
    if (res.ok && data.ok && Array.isArray(data.competitions)) {
      state.competitions = data.competitions;
      renderCompetitions();
    }
  } catch (_) {}
}


function competitionPageExtra(meta) {
  const key = meta.key || '';
  const name = meta.name || '';
  const related = state.matches.filter(m => (key && m.competitionKey === key) || (!key && name && m.competition === name));
  const results = related.filter(hasScore).slice(0, 6);
  const upcoming = related.filter(m => !hasScore(m)).slice(0, 6);
  const topLine = related.length ? `<div class="league-summary"><article><strong>${related.length}</strong><span>leikir í gagnasafni</span></article><article><strong>${results.length}</strong><span>nýjustu úrslit</span></article><article><strong>${upcoming.length}</strong><span>næstu leikir</span></article></div>` : '';
  const list = (items) => items.map(m => `<button class="league-match-row" type="button" data-id="${escapeHtml(m.id)}"><b>${escapeHtml(m.home)} ${escapeHtml(m.score || '–')} ${escapeHtml(m.away)}</b><span>${escapeHtml(shortDateTime(m))} · ${escapeHtml(m.venue || '')}</span></button>`).join('') || '<p class="muted">Engir leikir fundust í þessum hluta.</p>';
  setTimeout(() => {
    els.detail.querySelectorAll('.league-match-row').forEach(btn => btn.addEventListener('click', () => openMatch(btn.dataset.id)));
  }, 0);
  return `<div class="league-page-extra">${topLine}<div class="two-col"><section class="report-card"><h3>Næstu leikir</h3>${list(upcoming)}</section><section class="report-card"><h3>Nýjustu úrslit</h3>${list(results)}</section></div></div>`;
}

async function openCompetition(meta) {
  els.detail.innerHTML = '<div class="loading">Sæki opinbera KSÍ töflu…</div>';
  if (!els.dialog.open) els.dialog.showModal();
  try {
    const params = new URLSearchParams({ key: meta.key || '', competition: meta.name || '' });
    if (meta.url) params.set('url', meta.url);
    if (meta.id) params.set('id', meta.id);
    const res = await fetch(`/.netlify/functions/competition?${params.toString()}`, { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || 'Tókst ekki að sækja töflu');
    els.detail.innerHTML = `
      <header class="detail-hero">
        <span class="status-pill soon">Deildaryfirlit</span>
        <h2>${escapeHtml(data.table.competition || meta.name || 'Tafla')}</h2>
        <p>Staða, mörk, stig, form liða, næstu leikir og nýjustu úrslit.</p>
      </header>
      <section>
        ${tableMarkup(data.table, '', '')}
        ${competitionPageExtra(meta)}
      </section>`;
  } catch (err) {
    els.detail.innerHTML = `<div class="loading error">${escapeHtml(err.message)}</div>`;
  }
}


function applyTheme() {
  document.documentElement.dataset.theme = state.theme;
  if (els.themeBtn) els.themeBtn.textContent = state.theme === 'light' ? 'Dökk stilling' : 'Ljós stilling';
  localStorage.setItem('fotboltavaktin.theme', state.theme);
}
function showToast(title, body = '') {
  if (!els.toastStack) return;
  const item = document.createElement('div');
  item.className = 'toast-item';
  item.innerHTML = `<strong>${escapeHtml(title)}</strong>${body ? `<span>${escapeHtml(body)}</span>` : ''}`;
  els.toastStack.appendChild(item);
  setTimeout(() => item.classList.add('show'), 20);
  setTimeout(() => { item.classList.remove('show'); setTimeout(() => item.remove(), 300); }, 7000);
}
function scoreSnapshot(matches) {
  const snap = {};
  for (const m of matches || []) {
    if (hasScore(m)) snap[m.id] = { score: m.score, home: m.home, away: m.away, competition: m.competition };
  }
  return snap;
}
function detectLiveChanges(newMatches) {
  const previous = state.lastSnapshot || {};
  const next = scoreSnapshot(newMatches);
  const changes = [];
  for (const [id, row] of Object.entries(next)) {
    if (previous[id] && previous[id].score !== row.score) changes.push(row);
    if (!previous[id]) {
      const m = newMatches.find(x => x.id === id);
      if (m && isLiveMatch(m)) changes.push(row);
    }
  }
  if (changes.length) {
    changes.slice(0, 3).forEach(c => showToast('Staða breytt', `${c.home} ${c.score} ${c.away}`));
  }
  state.lastSnapshot = next;
  localStorage.setItem('fotboltavaktin.scoreSnapshot', JSON.stringify(next));
}
function reportMarkup(report = {}, match = {}) {
  const events = Array.isArray(report.events) ? report.events : [];
  const assistants = Array.isArray(report.assistants) ? report.assistants : [];
  const homeLineup = report.lineups?.home || [];
  const awayLineup = report.lineups?.away || [];
  const eventRows = events.length ? events.map(e => `<li><b>${escapeHtml(e.minute ? e.minute + '\'' : '')}</b> <span>${escapeHtml(e.type || 'atburður')}</span> ${escapeHtml(e.text || '')}</li>`).join('') : '<li>Engir atburðir fundust í opnum gögnum enn.</li>';
  const lineupList = (items) => items.length ? `<ol>${items.slice(0, 18).map(x => `<li>${escapeHtml(x)}</li>`).join('')}</ol>` : '<p class="muted">Byrjunarlið fannst ekki í opnum gögnum enn.</p>';
  const badge = report.available ? '<span class="source-badge official">Leikskýrsla fannst</span>' : '<span class="source-badge fallback">Beðið eftir skýrslu</span>';
  const link = report.sourceUrl ? `<a class="big-link" href="${escapeHtml(report.sourceUrl)}" target="_blank" rel="noopener noreferrer">Opna leikskýrslu / uppruna</a>` : '';
  return `
    <div class="report-card report-deluxe">
      ${badge}
      <h3>Leikskýrsla</h3>
      <p>${escapeHtml(report.message || 'Leikskýrsla er ekki komin inn enn.')}</p>
      <div class="report-grid">
        <article><span>Dómari</span><strong>${escapeHtml(report.referee || 'Ekki birt enn')}</strong></article>
        <article><span>Aðstoðardómarar</span><strong>${escapeHtml(assistants.join(', ') || 'Ekki birt enn')}</strong></article>
        <article><span>Áhorfendur</span><strong>${escapeHtml(report.attendance || 'Ekki birt')}</strong></article>
        <article><span>Atburðir</span><strong>${events.length}</strong></article>
      </div>
      <div class="two-col report-columns">
        <section><h4>Atburðir</h4><ul class="event-list">${eventRows}</ul></section>
        <section><h4>Staða gagna</h4><p class="muted">Vefurinn reynir að lesa dómara, mörk, spjöld, skiptingar og byrjunarlið úr opnum KSÍ/COMET gögnum. Atburðir eru aðeins sýndir þegar þeir líta út eins og staðfestir leikjaatburðir með mínútu — ekki fréttafyrirsagnir.</p>${link}</section>
      </div>
      <div class="two-col report-columns">
        <section><h4>${escapeHtml(match.home || 'Heimalið')} · byrjunarlið</h4>${lineupList(homeLineup)}</section>
        <section><h4>${escapeHtml(match.away || 'Útilið')} · byrjunarlið</h4>${lineupList(awayLineup)}</section>
      </div>
    </div>`;
}
function setupDetailSwipe() {
  const panels = ['overview', 'table', 'stats', 'intelligence', 'report'];
  let startX = 0;
  let startY = 0;
  els.detail.addEventListener('touchstart', e => {
    startX = e.changedTouches[0].clientX;
    startY = e.changedTouches[0].clientY;
  }, { passive: true });
  els.detail.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;
    if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy)) return;
    const active = els.detail.querySelector('[data-detail-tab].active')?.dataset.detailTab || 'overview';
    const index = panels.indexOf(active);
    const next = dx < 0 ? Math.min(panels.length - 1, index + 1) : Math.max(0, index - 1);
    setDetailTab(panels[next]);
  }, { passive: true });
}

async function loadMatches() {
  els.refresh.disabled = true;
  els.refresh.textContent = 'Sæki…';
  try {
    const res = await fetch('/.netlify/functions/matches', { cache: 'no-store' });
    if (!res.ok) throw new Error('Gagnaþjónn svaraði ekki rétt');
    const data = await res.json();
    const newMatches = Array.isArray(data.matches) ? data.matches : [];
    detectLiveChanges(newMatches);
    state.matches = newMatches;
    state.updatedAt = data.updatedAt || new Date().toISOString();
    state.errors = data.errors || [];
    state.competitions = buildCompetitionsFromMatches(state.matches);
    loadCompetitions();
    localStorage.setItem('fotboltavaktin.lastPayload', JSON.stringify(data));
  } catch (err) {
    const cached = localStorage.getItem('fotboltavaktin.lastPayload');
    if (cached) {
      const data = JSON.parse(cached);
      state.matches = data.matches || [];
      state.updatedAt = data.updatedAt;
      state.errors = [`Offline/cache: ${err.message}`];
      state.competitions = buildCompetitionsFromMatches(state.matches);
    } else {
      state.errors = [err.message];
    }
  } finally {
    els.refresh.disabled = false;
    els.refresh.textContent = 'Uppfæra';
    render();
  }
}

document.querySelectorAll('.controls .tab').forEach(btn => {
  btn.addEventListener('click', () => setFilter(btn.dataset.filter));
});
document.querySelectorAll('[data-filter-jump]').forEach(btn => btn.addEventListener('click', () => setFilter(btn.dataset.filterJump)));
els.refresh.addEventListener('click', loadMatches);
els.search.addEventListener('input', e => { state.query = e.target.value; renderCards(); });
if (els.teams) { els.teams.value = state.mine.join(', '); els.teams.addEventListener('change', e => { state.mine = normalizeTeamsInput(e.target.value); localStorage.setItem('fotboltavaktin.mine', JSON.stringify(state.mine)); render(); }); }
if (els.leagues) { els.leagues.value = state.favoriteLeagues.join(', '); els.leagues.addEventListener('change', e => { state.favoriteLeagues = normalizeTeamsInput(e.target.value); localStorage.setItem('fotboltavaktin.leagues', JSON.stringify(state.favoriteLeagues)); render(); }); }
if (els.themeBtn) els.themeBtn.addEventListener('click', () => { state.theme = state.theme === 'light' ? 'dark' : 'light'; applyTheme(); });
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); state.installPrompt = e; if (els.installBtn) els.installBtn.classList.remove('hidden'); });
if (els.installBtn) els.installBtn.addEventListener('click', async () => { if (!state.installPrompt) return; state.installPrompt.prompt(); await state.installPrompt.userChoice.catch(() => {}); state.installPrompt = null; els.installBtn.classList.add('hidden'); });
els.closeDialog.addEventListener('click', () => els.dialog.close());
els.dialog.addEventListener('click', e => { if (e.target === els.dialog) els.dialog.close(); });

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
applyTheme();
loadMatches();
setInterval(loadMatches, 60000);
