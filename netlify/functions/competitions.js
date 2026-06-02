const { getAllMatches, summarizeCompetitions } = require('./_football-data');

exports.handler = async () => {
  try {
    const { matches, errors } = await getAllMatches();
    const competitions = summarizeCompetitions(matches);
    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=300, s-maxage=600' },
      body: JSON.stringify({ ok: true, version: '0.3.0', updatedAt: new Date().toISOString(), errors, competitions })
    };
  } catch (err) {
    return { statusCode: 500, headers: { 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify({ ok: false, error: err.message }) };
  }
};
