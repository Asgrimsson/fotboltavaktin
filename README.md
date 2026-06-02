# Fótboltavaktin v0.1

Netlify-ready PWA sem sýnir íslenska fótboltaleiki á síma, iPad og Chromebook.

## Hvað er inni?

- `index.html` — vefurinn sjálfur
- `style.css` — responsive útlit
- `app.js` — síur, leit, mín lið, sjálfvirk endurhleðsla
- `netlify/functions/matches.js` — serverless scraper / JSON API
- `manifest.webmanifest` + `sw.js` — PWA og offline skel
- `netlify.toml` — Netlify stillingar

## Heimildir í v0.1

- KSÍ er aðalheimild fyrir næstu leiki.
- Fótbolti.net er prófað sem aukagjafi þegar greinilegir leikjalistar finnast.
- Úrslit.net er undirbúið sem skoðaður gagnagjafi, en vefurinn er líklega að stórum hluta client-rendered og þarf sérvinnslu í næstu útgáfu.

## Keyrsla á tölvu

```bash
cd fotboltavaktin
npm install
npx netlify dev
```

Opnaðu síðan slóðina sem Netlify CLI birtir, oftast:

```text
http://localhost:8888
```

## Deploy á Netlify

1. Settu möppuna á GitHub.
2. Veldu **Add new site → Import an existing project** í Netlify.
3. Build command: `npm run build`
4. Publish directory: `.`
5. Functions directory: `netlify/functions`
6. Deploy.

## Mikilvægt

Staðan „í gangi“ í v0.1 er reiknuð út frá upphafstíma og tveggja klukkustunda leikglugga, nema lifandi staða finnist í heimildargögnum. Þetta er örugg byrjun, en ekki endilega fullkomin live-staða.
