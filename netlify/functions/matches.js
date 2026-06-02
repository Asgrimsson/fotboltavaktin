const { SOURCES, getAllMatches } = require('./_football-data');

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
        version: '0.3.0',
        updatedAt: new Date().toISOString(),
        count: matches.length,
        sources: SOURCES,
        note: 'KSÍ er aðalheimild. v0.3 reynir að tengja leiki við opinberar KSÍ mótasíður og stöðutöflur. Í gangi er stundum reiknað út frá leiktíma ef lifandi staða finnst ekki.',
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
