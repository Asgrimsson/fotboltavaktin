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
        version: '1.2.0',
        updatedAt: new Date().toISOString(),
        count: matches.length,
        sources: SOURCES,
        note: "KSÍ er aðalheimild. v1.2 fjarlægir Fótbolti.net-fallback, síar út yngri flokka 2.–5. flokk og reiknar 'í gangi' út frá KSÍ-leiktíma þegar lifandi staða finnst ekki.",
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
