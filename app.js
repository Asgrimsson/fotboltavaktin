const state = {
  matches: [],
  activeFilter: 'now',
  activeLeague: '',
  query: '',
  mine: JSON.parse(localStorage.getItem('fotboltavaktin.mine') || '[]'),
  updatedAt: null,
  errors: [],
  competitions: []
};

const els = {
  cards: document.querySelector('#cards'),
  template: document.querySelector('#matchTemplate'),
  empty: document.querySelector('#emptyState'),
  status: document.querySelector('#statusStrip'),
  refresh: document.querySelector('#refreshBtn'),
  search: document.querySelector('#searchInput'),
  teams: document.querySelector('#teamsInput'),
  leagueStrip: document.querySelector('#leagueStrip'),
  dialog: document.querySelector('#matchDialog'),
  detail: document.querySelector('#detailContent'),
  closeDialog: document.querySelector('#closeDialog'),
  metricNow: document.querySelector('#metricNow'),
  metricToday: document.querySelector('#metricToday'),
  metricResults: document.querySelector('#metricResults'),
  metricTotal: document.querySelector('#metricTotal'),
  competitionOverview: document.querySelector('#competitionOverview')
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
function normalizeTeamsInput(value) { return value.split(',').map(s => s.trim()).filter(Boolean); }
function includesAnyTeam(match, teams) {
  if (!teams.length) return false;
  const hay = `${match.home} ${match.away}`.toLowerCase();
  return teams.some(team => hay.includes(team.toLowerCase().trim()));
}
function hasScore(match) { return /\d+\s*[-:]\s*\d+/.test(match.score || ''); }
function pillClass(status) {
  if (status === 'í gangi') return 'live';
  if (status === 'á eftir') return 'soon';
  if (status === 'lokið') return 'done';
  return '';
}

function getFilteredMatches() {
  const q = state.query.toLowerCase().trim();
  let items = [...state.matches];
  if (state.activeFilter === 'now') items = items.filter(m => m.status === 'í gangi');
  if (state.activeFilter === 'today') items = items.filter(m => isSameIcelandDay(m.startTime));
  if (state.activeFilter === 'upcoming') items = items.filter(m => !hasScore(m) && (!m.startTime || new Date(m.startTime).getTime() >= Date.now() - 7200000)).slice(0, 60);
  if (state.activeFilter === 'results') items = items.filter(hasScore);
  if (state.activeFilter === 'mine') items = items.filter(m => includesAnyTeam(m, state.mine));
  if (state.activeLeague) items = items.filter(m => (m.competitionKey || '') === state.activeLeague);
  if (q) items = items.filter(m => `${m.home} ${m.away} ${m.venue} ${m.competition} ${m.source} ${m.score}`.toLowerCase().includes(q));
  return items;
}

function renderStatus() {
  const updated = state.updatedAt ? new Intl.DateTimeFormat('is-IS', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Atlantic/Reykjavik' }).format(new Date(state.updatedAt)) : 'óþekkt';
  const mine = state.mine.length ? state.mine.join(', ') : 'engin valin';
  const extra = state.errors.length ? `<span>Viðvörun: ${state.errors.length} heimild gaf ekki full gögn</span>` : '';
  els.status.innerHTML = `<span>Síðast uppfært ${updated}</span><span>Aðalheimild: KSÍ</span><span>Aukagjafi: Fótbolti.net</span><span>Mín lið: ${escapeHtml(mine)}</span>${extra}`;
}
function renderMetrics() {
  els.metricNow.textContent = state.matches.filter(m => m.status === 'í gangi').length;
  els.metricToday.textContent = state.matches.filter(m => isSameIcelandDay(m.startTime)).length;
  els.metricResults.textContent = state.matches.filter(hasScore).length;
  els.metricTotal.textContent = state.matches.length;
}
function renderLeagues() {
  const counts = new Map();
  for (const m of state.matches) {
    if (!m.competitionKey || !m.competition) continue;
    const row = counts.get(m.competitionKey) || { key: m.competitionKey, name: m.competition, count: 0 };
    row.count++;
    counts.set(m.competitionKey, row);
  }
  const items = Array.from(counts.values()).sort((a, b) => b.count - a.count).slice(0, 12);
  if (!items.length) { els.leagueStrip.innerHTML = ''; return; }
  els.leagueStrip.innerHTML = `<button class="league-chip ${state.activeLeague ? '' : 'active'}" data-key="">Allar deildir</button>` + items.map(item =>
    `<button class="league-chip ${state.activeLeague === item.key ? 'active' : ''}" data-key="${escapeHtml(item.key)}">${escapeHtml(item.name)} <b>${item.count}</b></button>`
  ).join('');
  els.leagueStrip.querySelectorAll('.league-chip').forEach(btn => btn.addEventListener('click', () => {
    state.activeLeague = btn.dataset.key;
    render();
  }));
}
function renderCards() {
  const items = getFilteredMatches();
  els.cards.innerHTML = '';
  els.empty.classList.toggle('hidden', items.length > 0);
  items.forEach(match => {
    const node = els.template.content.cloneNode(true);
    const card = node.querySelector('.match-card');
    const open = node.querySelector('.match-open');
    const detailBtn = node.querySelector('.detail-btn');
    node.querySelector('.status-pill').textContent = match.status || 'á dagskrá';
    node.querySelector('.status-pill').classList.add(pillClass(match.status));
    node.querySelector('.time').textContent = fmtTime(match.startTime, match.localTime || match.rawTime);
    node.querySelector('.date').textContent = fmtDate(match.startTime) || match.dateLabel || '';
    node.querySelector('.home').textContent = match.home;
    node.querySelector('.away').textContent = match.away;
    node.querySelector('.score-inline').textContent = hasScore(match) ? ` ${match.score} ` : '';
    const meta = [match.competition, match.venue].filter(Boolean).join(' · ');
    node.querySelector('.meta').textContent = meta || 'Nánari upplýsingar ekki tiltækar';
    node.querySelector('.source').textContent = match.source || 'Heimild';
    node.querySelector('.source-link').href = match.sourceUrl || '#';
    open.addEventListener('click', () => openMatch(match.id));
    detailBtn.addEventListener('click', () => openMatch(match.id));
    card.dataset.id = match.id;
    els.cards.appendChild(node);
  });
}
function render() { renderStatus(); renderMetrics(); renderLeagues(); renderCompetitions(); renderCards(); }

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
function renderCompetitions() {
  if (!els.competitionOverview) return;
  const items = state.competitions.length ? state.competitions : Array.from(new Map(state.matches.map(m => [m.competitionKey, { key: m.competitionKey, name: m.competition, matchCount: 1, resultCount: hasScore(m) ? 1 : 0, upcomingCount: hasScore(m) ? 0 : 1, liveCount: m.status === 'í gangi' ? 1 : 0, hasOfficialLink: Boolean(m.competitionUrl), url: m.competitionUrl, id: m.competitionId }])).values()).filter(x => x.key && x.name);
  if (!items.length) { els.competitionOverview.innerHTML = ''; return; }
  els.competitionOverview.innerHTML = `
    <div class="section-heading"><div><p class="eyebrow">v0.3</p><h2>Deildaryfirlit</h2></div><span>${items.length} mót/riðlar fundust</span></div>
    <div class="competition-grid">${items.slice(0, 18).map(item => `
      <article class="competition-card">
        <div><h3>${escapeHtml(item.name)}</h3><p>${item.matchCount || 0} leikir · ${item.resultCount || 0} úrslit · ${item.upcomingCount || 0} framundan</p></div>
        <div class="competition-actions">
          <span class="source-badge ${item.hasOfficialLink ? 'official' : 'calculated'}">${item.hasOfficialLink ? 'KSÍ tenging' : 'varatafla'}</span>
          <button class="mini-btn competition-open" type="button" data-key="${escapeHtml(item.key)}" data-name="${escapeHtml(item.name)}" data-url="${escapeHtml(item.url || '')}" data-id="${escapeHtml(item.id || '')}">Opna töflu</button>
        </div>
      </article>`).join('')}</div>`;
  els.competitionOverview.querySelectorAll('.competition-open').forEach(btn => btn.addEventListener('click', () => openCompetition(btn.dataset)));
}
function setDetailTab(name) {
  els.detail.querySelectorAll('[data-panel]').forEach(p => p.classList.toggle('hidden', p.dataset.panel !== name));
  els.detail.querySelectorAll('[data-detail-tab]').forEach(b => b.classList.toggle('active', b.dataset.detailTab === name));
}
async function openMatch(id) {
  els.detail.innerHTML = '<div class="loading">Sæki Match Center…</div>';
  if (!els.dialog.open) els.dialog.showModal();
  try {
    const res = await fetch(`/.netlify/functions/match-detail?id=${encodeURIComponent(id)}`, { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || 'Tókst ekki að sækja leik');
    const m = data.match;
    const homeStats = data.teamStats.home;
    const awayStats = data.teamStats.away;
    els.detail.innerHTML = `
      <header class="detail-hero">
        <span class="status-pill ${pillClass(m.status)}">${escapeHtml(m.status || 'á dagskrá')}</span>
        <h2>${escapeHtml(m.home)} <span>${escapeHtml(m.score || '–')}</span> ${escapeHtml(m.away)}</h2>
        <p>${escapeHtml(m.competition || 'Óþekkt keppni')} · ${escapeHtml(m.venue || 'Völlur ekki skráður')} · ${escapeHtml(fmtDate(m.startTime) || m.dateLabel || '')} ${escapeHtml(fmtTime(m.startTime, m.localTime || m.rawTime))}</p>
      </header>
      <nav class="detail-tabs">
        <button class="tab active" data-detail-tab="overview">Yfirlit</button>
        <button class="tab" data-detail-tab="table">Tafla</button>
        <button class="tab" data-detail-tab="stats">Liðatölfræði</button>
        <button class="tab" data-detail-tab="report">Leikskýrsla</button>
      </nav>
      <section data-panel="overview">
        <div class="fact-list">${(data.smartFacts || []).map(f => `<p>💡 ${escapeHtml(f)}</p>`).join('')}</div>
        <div class="two-col">${teamPanel('Heimalið', homeStats)}${teamPanel('Útilið', awayStats)}</div>
        <a class="big-link" href="${escapeHtml(m.sourceUrl || '#')}" target="_blank" rel="noopener noreferrer">Opna upprunaheimild</a>
      </section>
      <section data-panel="table" class="hidden">
        <h3>${escapeHtml(data.table.competition || 'Tafla')}</h3>
        ${tableMarkup(data.table, m.home, m.away)}
      </section>
      <section data-panel="stats" class="hidden">
        <div class="two-col">${teamPanel('Heimalið', homeStats)}${teamPanel('Útilið', awayStats)}</div>
        <div class="compare-bar"><span style="width:${Math.min(100, Math.max(5, (homeStats.gf || 0) * 8))}%"></span></div>
        <p class="data-note">Skoruð mörk og fengin mörk koma úr opinberri KSÍ töflu ef hún fannst, annars úr reiknaðri varatöflu.</p>
      </section>
      <section data-panel="report" class="hidden">
        <div class="report-card">
          <h3>Leikskýrsla</h3>
          <p>${escapeHtml(data.report.message)}</p>
          <ul>
            <li>Dómari: ${escapeHtml(data.report.referee || 'ekki tiltækt í v0.3')}</li>
            <li>Atburðir: ${data.report.events?.length || 0}</li>
            <li>Staða: undirbúið fyrir KSÍ/COMET leikskýrslu í næstu útgáfu</li>
          </ul>
        </div>
      </section>`;
    els.detail.querySelectorAll('[data-detail-tab]').forEach(btn => btn.addEventListener('click', () => setDetailTab(btn.dataset.detailTab)));
  } catch (err) {
    els.detail.innerHTML = `<div class="loading error">${escapeHtml(err.message)}</div>`;
  }
}

function buildCompetitionsFromMatches(matches) {
  const map = new Map();
  for (const m of matches || []) {
    if (!m.competitionKey || !m.competition) continue;
    const item = map.get(m.competitionKey) || { key: m.competitionKey, name: m.competition, id: m.competitionId || '', url: m.competitionUrl || '', matchCount: 0, resultCount: 0, upcomingCount: 0, liveCount: 0, hasOfficialLink: Boolean(m.competitionUrl || m.competitionId) };
    item.matchCount++;
    if (hasScore(m)) item.resultCount++; else item.upcomingCount++;
    if (m.status === 'í gangi') item.liveCount++;
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
        <p>Staða, mörk, stig og form liða.</p>
      </header>
      <section>
        ${tableMarkup(data.table, '', '')}
      </section>`;
  } catch (err) {
    els.detail.innerHTML = `<div class="loading error">${escapeHtml(err.message)}</div>`;
  }
}

async function loadMatches() {
  els.refresh.disabled = true;
  els.refresh.textContent = 'Sæki…';
  try {
    const res = await fetch('/.netlify/functions/matches', { cache: 'no-store' });
    if (!res.ok) throw new Error('Gagnaþjónn svaraði ekki rétt');
    const data = await res.json();
    state.matches = Array.isArray(data.matches) ? data.matches : [];
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
  btn.addEventListener('click', () => {
    document.querySelectorAll('.controls .tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.activeFilter = btn.dataset.filter;
    renderCards();
  });
});
els.refresh.addEventListener('click', loadMatches);
els.search.addEventListener('input', e => { state.query = e.target.value; renderCards(); });
els.teams.value = state.mine.join(', ');
els.teams.addEventListener('change', e => {
  state.mine = normalizeTeamsInput(e.target.value);
  localStorage.setItem('fotboltavaktin.mine', JSON.stringify(state.mine));
  render();
});
els.closeDialog.addEventListener('click', () => els.dialog.close());
els.dialog.addEventListener('click', e => { if (e.target === els.dialog) els.dialog.close(); });

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
loadMatches();
setInterval(loadMatches, 120000);
