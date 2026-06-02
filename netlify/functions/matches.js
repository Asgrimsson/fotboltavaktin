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
        version: '1.4.0',
        updatedAt: new Date().toISOString(),
        count: matches.length,
        sources: SOURCES,
        note: "KSÍ-only. v1.4 sýnir aðeins neðri fullorðinsdeildir, 2.–5. deild, og felur Bestu deildir/Lengjudeildir/yngri flokka.",
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
