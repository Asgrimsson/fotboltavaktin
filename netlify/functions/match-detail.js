const { getAllMatches, getBestCompetitionTable, teamStats, smartFacts, getMatchReport } = require('./_football-data');

exports.handler = async (event) => {
  try {
    const id = event.queryStringParameters?.id;
    if (!id) return { statusCode: 400, headers: { 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify({ ok: false, error: 'Vantar id' }) };

    const { matches, errors } = await getAllMatches();
    const match = matches.find(m => m.id === id);
    if (!match) return { statusCode: 404, headers: { 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify({ ok: false, error: 'Leikur fannst ekki í nýjustu gagnasókn' }) };

    const table = await getBestCompetitionTable(matches, match);
    const homeStats = teamStats(table, match.home);
    const awayStats = teamStats(table, match.away);

    const report = await getMatchReport(match);

    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=120, s-maxage=180' },
      body: JSON.stringify({
        ok: true,
        updatedAt: new Date().toISOString(),
        errors,
        match,
        table,
        teamStats: { home: homeStats, away: awayStats },
        smartFacts: smartFacts(match, table),
        report
      })
    };
  } catch (err) {
    return { statusCode: 500, headers: { 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify({ ok: false, error: err.message }) };
  }
};
