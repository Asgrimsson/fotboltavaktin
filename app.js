const state = {
  matches: [],
  activeFilter: 'now',
  query: '',
  mine: JSON.parse(localStorage.getItem('fotboltavaktin.mine') || '[]'),
  updatedAt: null,
  errors: []
};

const els = {
  cards: document.querySelector('#cards'),
  template: document.querySelector('#matchTemplate'),
  empty: document.querySelector('#emptyState'),
  status: document.querySelector('#statusStrip'),
  refresh: document.querySelector('#refreshBtn'),
  search: document.querySelector('#searchInput'),
  teams: document.querySelector('#teamsInput'),
  metricNow: document.querySelector('#metricNow'),
  metricToday: document.querySelector('#metricToday'),
  metricTotal: document.querySelector('#metricTotal')
};

function fmtDate(iso) {
  if (!iso) return '';
  return new Intl.DateTimeFormat('is-IS', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Atlantic/Reykjavik' }).format(new Date(iso));
}
function fmtTime(iso, fallback) {
  if (!iso) return fallback || '';
  return new Intl.DateTimeFormat('is-IS', { hour: '2-digit', minute: '2-digit', timeZone: 'Atlantic/Reykjavik' }).format(new Date(iso));
}
function isSameIcelandDay(iso, offset = 0) {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Atlantic/Reykjavik', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const y = Number(parts.find(p => p.type === 'year').value);
  const m = Number(parts.find(p => p.type === 'month').value) - 1;
  const day = Number(parts.find(p => p.type === 'day').value) + offset;
  const target = new Date(Date.UTC(y, m, day));
  const targetKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Atlantic/Reykjavik', year: 'numeric', month: '2-digit', day: '2-digit' }).format(target);
  const matchKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Atlantic/Reykjavik', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  return targetKey === matchKey;
}
function includesAnyTeam(match, teams) {
  if (!teams.length) return false;
  const hay = `${match.home} ${match.away}`.toLowerCase();
  return teams.some(team => hay.includes(team.toLowerCase().trim()));
}
function normalizeTeamsInput(value) {
  return value.split(',').map(s => s.trim()).filter(Boolean);
}
function getFilteredMatches() {
  const q = state.query.toLowerCase().trim();
  let items = [...state.matches];
  if (state.activeFilter === 'now') items = items.filter(m => m.status === 'í gangi');
  if (state.activeFilter === 'today') items = items.filter(m => isSameIcelandDay(m.startTime));
  if (state.activeFilter === 'upcoming') items = items.filter(m => !m.startTime || new Date(m.startTime).getTime() >= Date.now() - 7200000).slice(0, 40);
  if (state.activeFilter === 'mine') items = items.filter(m => includesAnyTeam(m, state.mine));
  if (q) {
    items = items.filter(m => `${m.home} ${m.away} ${m.venue} ${m.competition} ${m.source}`.toLowerCase().includes(q));
  }
  return items;
}
function pillClass(status) {
  if (status === 'í gangi') return 'live';
  if (status === 'á eftir') return 'soon';
  return '';
}
function renderStatus() {
  const updated = state.updatedAt ? new Intl.DateTimeFormat('is-IS', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Atlantic/Reykjavik' }).format(new Date(state.updatedAt)) : 'óþekkt';
  const mine = state.mine.length ? state.mine.join(', ') : 'engin valin';
  const extra = state.errors.length ? `<span>Viðvörun: ${state.errors.length} heimild gaf ekki full gögn</span>` : '';
  els.status.innerHTML = `<span>Síðast uppfært ${updated}</span><span>Aðalheimild: KSÍ</span><span>Mín lið: ${escapeHtml(mine)}</span>${extra}`;
}
function escapeHtml(value) {
  return String(value || '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
}
function renderMetrics() {
  els.metricNow.textContent = state.matches.filter(m => m.status === 'í gangi').length;
  els.metricToday.textContent = state.matches.filter(m => isSameIcelandDay(m.startTime)).length;
  els.metricTotal.textContent = state.matches.length;
}
function renderCards() {
  const items = getFilteredMatches();
  els.cards.innerHTML = '';
  els.empty.classList.toggle('hidden', items.length > 0);
  items.forEach(match => {
    const node = els.template.content.cloneNode(true);
    node.querySelector('.status-pill').textContent = match.status || 'á dagskrá';
    node.querySelector('.status-pill').classList.add(pillClass(match.status));
    node.querySelector('.time').textContent = fmtTime(match.startTime, match.localTime || match.rawTime);
    node.querySelector('.date').textContent = fmtDate(match.startTime) || match.dateLabel || '';
    node.querySelector('.home').textContent = match.home;
    node.querySelector('.away').textContent = match.away;
    const meta = [match.competition, match.venue].filter(Boolean).join(' · ');
    node.querySelector('.meta').textContent = meta || 'Nánari upplýsingar ekki tiltækar';
    node.querySelector('.source').textContent = match.source || 'Heimild';
    node.querySelector('.source-link').href = match.sourceUrl || '#';
    els.cards.appendChild(node);
  });
}
function render() {
  renderStatus();
  renderMetrics();
  renderCards();
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
    localStorage.setItem('fotboltavaktin.lastPayload', JSON.stringify(data));
  } catch (err) {
    const cached = localStorage.getItem('fotboltavaktin.lastPayload');
    if (cached) {
      const data = JSON.parse(cached);
      state.matches = data.matches || [];
      state.updatedAt = data.updatedAt;
      state.errors = [`Offline/cache: ${err.message}`];
    } else {
      state.errors = [err.message];
    }
  } finally {
    els.refresh.disabled = false;
    els.refresh.textContent = 'Uppfæra';
    render();
  }
}

document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
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

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
loadMatches();
setInterval(loadMatches, 120000);
