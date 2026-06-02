const { slug, getAllMatches, getBestCompetitionTable } = require('./_football-data');

exports.handler = async (event) => {
  try {
    const q = event.queryStringParameters || {};
    const key = q.key || slug(q.competition || q.name || '');
    if (!key || key === 'okunnugt') {
      return { statusCode: 400, headers: { 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify({ ok: false, error: 'Vantar competition/key' }) };
    }
    const { matches, errors } = await getAllMatches();
    const representative = matches.find(m => (m.competitionKey || slug(m.competition)) === key) || {
      competitionKey: key,
      competition: q.competition || q.name || '',
      competitionId: q.id || '',
      competitionUrl: q.url || ''
    };
    if (q.id) representative.competitionId = q.id;
    if (q.url) representative.competitionUrl = q.url;
    const table = await getBestCompetitionTable(matches, representative);
    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=600, s-maxage=900' },
      body: JSON.stringify({ ok: true, updatedAt: new Date().toISOString(), errors, table })
    };
  } catch (err) {
    return { statusCode: 500, headers: { 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify({ ok: false, error: err.message }) };
  }
};
