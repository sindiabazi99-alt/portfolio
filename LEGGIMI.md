# Sindi Abazi — Portfolio

Sito statico fatto con Vite (HTML + CSS + JavaScript) con un CMS per modificare i contenuti.
Online su https://sindi-abazi.vercel.app — ogni modifica su GitHub (`main`) viene pubblicata da Vercel in automatico (~1 minuto).

## Modificare il sito: il CMS

Vai su **https://sindi-abazi.vercel.app/admin/**

### Primo accesso (una volta sola)

1. GitHub → foto profilo → **Settings → Developer settings → Personal access tokens → Tokens (classic)**.
2. **Generate new token (classic)**, spunta **repo**, scegli la scadenza, **Generate token**.
3. Copia il codice (`ghp_…`) e incollalo nella pagina `/admin/`. Il browser se lo ricorda.

Va bene anche un token *fine-grained* con accesso al solo repo `portfolio` e **Contents: Read and write**.

### Come si usa

- **Progetti**: la lista di tutti i lavori. Trascina le righe (⠿) per cambiare l'ordine sul sito,
  l'occhio mostra/nasconde un progetto. Clicca un progetto per modificarlo.
- **Nel progetto**: titolo, categoria, tipo (tag), cliente, anno, descrizione, visibile/nascosto.
  Immagini: trascinale dentro (anche tante insieme), riordinale trascinandole, × per toglierle.
  Vengono ottimizzate da sole. Le prime 8 (numero nero) finiscono nella sfera della home.
- **+ Nuovo progetto** in alto a destra nella lista.
- **Impostazioni**: nome, sottotitolo, bio, clienti, discipline, contatti, testi per Google e immagine di anteprima social.
- **Pubblica**: niente va online finché non lo premi (il numero indica quante modifiche ci sono).
  Poi in alto vedi "In pubblicazione…" e dopo circa un minuto "Online ✓".
- Menu **•••** → *Cronologia modifiche* per vedere (e all'occorrenza recuperare) ogni versione precedente.

## Com'è fatto (per chi mette mano al codice)

- `content/projects/*.json` — un file per progetto (è quello che modifica il CMS)
- `content/settings.json` — testi e contatti
- `public/uploads/` — tutte le immagini
- `public/admin/` — il CMS (HTML/CSS/JS, nessun servizio esterno: parla direttamente con GitHub)
- `scripts/build-content.mjs` — prima di ogni build crea le miniature (`public/_gen/`) e `src/content.gen.js`
- `src/main.js`, `src/style.css` — sfera 3D, griglia, index, pagine progetto

Le categorie sono fisse in `src/main.js` e `public/admin/admin.js` (`CATS`): se ne aggiungi una, aggiungila in entrambi.
Le categorie senza progetti non vengono mostrate.

### In locale

```bash
npm install
npm run dev      # http://localhost:5173 — su /admin/ il CMS modifica direttamente i file locali
```
