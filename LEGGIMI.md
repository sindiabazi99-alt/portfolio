# Sindi Abazi — Portfolio

Sito statico fatto con Vite (HTML + CSS + JavaScript). Le immagini sono già ottimizzate in `public/img/`.

## Pubblicarlo su Vercel

Serve una volta sola: un account gratuito su https://vercel.com e Node.js installato (https://nodejs.org, versione LTS).

1. Scompatta lo zip.
2. Apri il **Terminale** e scrivi `cd ` (con lo spazio), trascina dentro la cartella scompattata e premi Invio.
3. Scrivi:

```bash
npx vercel --prod
```

4. La prima volta chiede di fare login (si apre il browser) e qualche domanda: premi Invio su tutto.
   Come nome progetto puoi scrivere `sindi-abazi`.
5. Alla fine stampa il link del sito, tipo `https://sindi-abazi.vercel.app`.

Per ripubblicare dopo una modifica basta rilanciare `npx vercel --prod` dalla stessa cartella.
Da vercel.com → progetto → **Settings → Domains** puoi collegare un dominio tuo (es. `sindiabazi.com`).

**Senza terminale:** con l'app GitHub Desktop metti la cartella in un repository GitHub, poi su vercel.com
**Add New… → Project → Import** quel repository e clicca **Deploy**. Da lì ogni modifica su GitHub si pubblica da sola.

## Modificare i contenuti

- **Testi dei progetti** (titolo, tipo, cliente, anno, descrizione): `src/data.js`
- **Bio e contatti**: `index.html` (sezione Info) e `CONTACT` in cima a `src/main.js`
- **Immagine di anteprima social**: `public/og-sindi.jpg`
- **Provare il sito sul computer**: `npm install` e poi `npm run dev`

`scripts/build-images.mjs` serve solo per rigenerare le immagini dalle cartelle originali dei lavori:
per aggiornare il sito non serve.
