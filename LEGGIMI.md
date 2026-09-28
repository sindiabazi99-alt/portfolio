# Sindi Abazi — Portfolio

Sito statico fatto con Vite (HTML + CSS + JavaScript) con un CMS per modificare i contenuti.
Online su https://sindi-abazi.vercel.app — ogni modifica su GitHub (`main`) viene pubblicata da Vercel in automatico (~1 minuto).

## Modificare il sito: il CMS

Vai su **https://sindi-abazi.vercel.app/admin/**

### Primo accesso (una volta sola)

1. Su GitHub: foto profilo → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
2. Nome: `CMS portfolio`, scadenza: quella che preferisci (anche "No expiration").
3. **Repository access → Only select repositories →** `portfolio`.
4. **Permissions → Repository permissions → Contents: Read and write.**
5. **Generate token**, copia il codice (inizia con `github_pat_…`).
6. Su `/admin/` clicca **Sign In Using Access Token** e incolla il codice. Il browser se lo ricorda.

(Il pulsante "Sign In with GitHub" non è configurato: usa sempre il token.)

### Cosa puoi fare

- **Progetti**: titolo, ordine, categoria, tipo (tag), cliente, anno, descrizione, immagini.
  - **Immagini**: puoi caricarne tante insieme e trascinarle per riordinarle. Vengono convertite in WebP e ridotte a 2400px da sole.
    Le prime 8 di ogni progetto finiscono nella sfera della home.
  - **Ordine**: numero che decide la posizione (10, 20, 30…). Per mettere un progetto tra il 20 e il 30 usa 25.
  - **Nascondi dal sito**: il progetto resta nel CMS ma sparisce dal sito.
  - **Nuovo progetto**: pulsante "Nuovo" in alto nella lista progetti.
- **Impostazioni sito**: nome, sottotitolo, bio, "Worked on", discipline, contatti, titolo/descrizione per Google, immagine di anteprima social.

Dopo **Salva**, il sito si aggiorna in circa un minuto (ricarica la pagina).

## Com'è fatto (per chi mette mano al codice)

- `content/projects/*.json` — un file per progetto (è quello che modifica il CMS)
- `content/settings.json` — testi e contatti
- `public/uploads/` — tutte le immagini
- `public/admin/config.yml` — configurazione del CMS (campi, categorie)
- `scripts/build-content.mjs` — prima di ogni build crea le miniature (`public/_gen/`) e `src/content.gen.js`
- `src/main.js`, `src/style.css` — sfera 3D, griglia, index, pagine progetto

Le categorie sono fisse in `src/main.js` (`CATS`) e in `public/admin/config.yml`: se ne aggiungi una, aggiungila in entrambi.
Le categorie senza progetti non vengono mostrate.

### In locale

```bash
npm install
npm run dev      # http://localhost:5173 — il CMS locale è su /admin/index.html ("Work with Local Repository")
```
