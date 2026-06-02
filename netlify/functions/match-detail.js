const { getAllMatches, buildCompetitionTable, getBestCompetitionTable, teamStats, smartFacts, getMatchReport } = require('./_football-data');

const detailCache = new Map();
const TTL = 10 * 60 * 1000;

exports.handler = async (event) => {
  try {
    const id = event.queryStringParameters?.id;
    const fast = event.queryStringParameters?.fast === '1';
    if (!id) return { statusCode: 400, headers: { 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify({ ok: false, error: 'Vantar id' }) };

    const cached = detailCache.get(id);
    if (cached && Date.now() - cached.time < TTL) {
      return { statusCode: 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=300, s-maxage=600', 'x-fotboltavaktin-cache': 'hit' }, body: JSON.stringify(cached.body) };
    }

    const { matches, errors } = await getAllMatches();
    const match = matches.find(m => m.id === id);
    if (!match) return { statusCode: 404, headers: { 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify({ ok: false, error: 'Leikur fannst ekki í nýjustu gagnasókn' }) };

    const table = fast ? buildCompetitionTable(matches, match.competitionKey || '') : await getBestCompetitionTable(matches, match);
    const report = fast ? { available: false, sourceUrl: match.sourceUrl || '', message: 'Leikskýrsla er ekki sótt í hraðham.', referee: '', assistants: [], attendance: '', events: [], lineups: { home: [], away: [] }, rawHints: [] } : await getMatchReport(match);
    const homeStats = teamStats(table, match.home);
    const awayStats = teamStats(table, match.away);

    const body = {
      ok: true,
      updatedAt: new Date().toISOString(),
      errors,
      match,
      table,
      teamStats: { home: homeStats, away: awayStats },
      smartFacts: smartFacts(match, table),
      report
    };
    detailCache.set(id, { time: Date.now(), body });

    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=300, s-maxage=600', 'x-fotboltavaktin-cache': 'miss' },
      body: JSON.stringify(body)
    };
  } catch (err) {
    return { statusCode: 500, headers: { 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify({ ok: false, error: err.message }) };
  }
};
