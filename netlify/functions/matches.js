const { SOURCES, getAllMatches } = require('./_football-data');

exports.handler = async () => {
  try {
    const { matches, errors } = await getAllMatches();
    return {
      statusCode: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'public, max-age=90, s-maxage=120'
      },
      body: JSON.stringify({
        ok: true,
        version: '2.6.0',
        updatedAt: new Date().toISOString(),
        count: matches.length,
        sources: SOURCES,
        note: "KSÍ-only. v1.8 sækir sjálfvirkt neðri fullorðinsdeildir beint af KSÍ mótasíðum: 2., 3., 4. og 5. deild karla. Bestu deildir/Lengjudeildir/yngri flokkar eru faldir.",
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
