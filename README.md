# Fótboltavaktin v1.0

Netlify-ready PWA fyrir íslenska fótboltaleiki.

## Nýtt í v1.0

- Leikskýrsla + dómarar: reynir að lesa dómara, aðstoðardómara, atburði, mörk/spjöld og byrjunarlið úr opnum KSÍ/COMET gögnum þegar þau eru birt.
- Live Pulse: sjálfvirk uppfærsla á 60 sekúndna fresti, staða merkt og toast-tilkynningar ef skor breytist.
- Síma-app polish: betri farsímagluggi, swipe milli Match Center flipa, stærri spjöld, ljós/dökk stilling og PWA heimaskjáshnappur.
- Mín vakt, deildarsíður, KSÍ töflur og liðatölfræði halda sér úr fyrri útgáfum.

## Keyrsla local

```bash
npm install
npx netlify dev
```

Opnaðu síðan `http://localhost:8888`.

## Deploy á Netlify

Build command: `npm run build`  
Publish directory: `.`  
Functions directory: `netlify/functions`
