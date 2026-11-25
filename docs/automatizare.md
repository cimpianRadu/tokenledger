# Cum merge site-ul singur

Pus pe picioare pe 25 noiembrie 2026, după trei luni în care site-ul a servit
prețuri din 11 august pentru că sincronizarea depindea de cineva care să-și
amintească de ea. Regula de proiectare de aici încolo: **orice lucru care
trebuie făcut regulat ori rulează singur, ori nu se face.**

Două feluri de automatizare, pentru că fac lucruri diferite:

- **GitHub Actions** — treaba mecanică, fără judecată. Rulează pe serverele
  GitHub, deci merge și când laptopul lui Radu e închis. Fără secrete: nimic
  din ce face nu are nevoie de o cheie.
- **Rutine Claude** (`~/.claude/scheduled-tasks/`) — ce cere judecată: să scrie
  o pagină, să diagnosticheze o stricăciune, să citească niște cifre și să
  spună ce înseamnă. Rulează **doar când aplicația Claude e deschisă**; dacă e
  închisă la ora programată, rularea se face la următoarea pornire. De-aia
  slotul de conținut se încearcă de patru ori pe zi, patru zile la rând.

## Ce rulează

| când | ce | unde | ce face când pică |
|---|---|---|---|
| luni 06:17 UTC | **sync prețuri** | Actions (`sync-prices.yml`) | job roșu → GitHub îi trimite email lui Radu; snapshot-ul vechi rămâne |
| zilnic 06:47 UTC | **canar pe site-ul live** (`healthcheck.yml`) | Actions | la fel: job roșu = email |
| marți 06:50 | **verificare + reparație** (`tokenledger-health`) | rutină Claude | repară singură ce e sigur, dă push, retestează; email doar dacă e o problemă |
| joi (reîncercări joi–duminică, 4×/zi) | **o pagină nouă** (`tokenledger-continut`) | rutină Claude | nu dă push dacă build-ul pică; scrie motivul în jurnalul cozii |
| pe 3 ale lunii 08:20 | **măsurători + coadă** (`tokenledger-keywords`) | rutină Claude | email doar dacă e blocată |
| pe 1 și 15, 09:05 | **raport pe email** (`tokenledger-raport`) | rutină Claude | emailul pleacă întotdeauna |

Orele rutinelor sunt ora României; cele din Actions sunt UTC.

## Sincronizarea prețurilor

`npm run sync` ia fișierul public LiteLLM, îl normalizează, pliază aliasurile
și scrie `src/data/models.json` plus un rând lunar în `src/data/history.json`.
Workflow-ul face sync, build cu validare pe output, și comite **doar dacă
prețurile chiar s-au mișcat**.

Două porți îl opresc înainte să strice ceva:

- `sync-pricing.mjs` iese cu cod 1 și **nu scrie nimic** dacă un furnizor
  așteptat nu mai potrivește niciun model (s-a întâmplat de două ori: Cohere
  sub `cohere_chat`, Groq mutat la `groq/<laborator>/<model>`). Un furnizor
  șters în tăcere înseamnă pagini indexate care dispar din sitemap.
- `validate.mjs` pică build-ul la prețuri mai vechi de 30 de zile, linkuri
  rupte, titluri duplicate și titluri care și-au pierdut keyword-ul.

Nicio rutină nu are voie să slăbească porțile astea ca să treacă un build.

## Canarul

`npm run health` întreabă **site-ul live**, nu build-ul local: răspund rutele,
un URL inexistent mai dă 404, cât de vechi sunt prețurile din `/status.json`,
cât de vechi e deploy-ul, mai are sitemap-ul tot site-ul. Iese cu cod 1 la
orice problemă, deci workflow-ul roșu e alerta — GitHub trimite emailul, fără
serviciu de mail propriu.

`/status.json` publică numai date calendaristice, niciodată o vechime în zile:
fișierul e static după build, deci o vechime calculată ar îngheța la momentul
build-ului și ar arăta proaspătă la nesfârșit — exact eroarea pe care o caută.

## Conținut

Coada e `docs/content-queue.md`, cu reguli scrise acolo: nicio cifră care nu
vine din `src/data/` sau din tokenizer, un keyword măsurat pe pagină, titlul
înregistrat în `KEYWORD_TARGETS`. Rutina de joi ia prima linie nebifată, o
construiește, rulează `npm run build`, se uită la pagină în browser la lățime
de telefon, dă push, așteaptă deploy-ul, trimite URL-ul la IndexNow și cere
indexarea în Search Console, apoi bifează linia și scrie în jurnal.

Rutina lunară reumple coada, dar numai cu itemi al căror volum a fost măsurat
în rularea respectivă și care se pot construi din datele existente. Un item
care ar cere date pe care site-ul nu le are se marchează `[BLOCAT]` cu motivul,
nu se construiește din memorie.

## Raportul

Pe 1 și pe 15, pe email, întotdeauna, chiar dacă nu s-a întâmplat nimic: ce au
făcut rutinele, cifrele cu diferența față de raportul trecut (vizitatori,
keyword-uri rankate, impresii și clicuri din Search Console, pagini indexate,
data prețurilor), o frază cinstită despre direcție, și ce trebuie făcut de
Radu. Fiecare raport se salvează în `docs/rapoarte/`, ca următorul să aibă cu
ce compara.

**Regula de decizie** e scrisă în rutină: dacă pe la 1 martie 2027 Search
Console nu arată impresii în creștere pe termenii de token counter, raportul
recomandă explicit oprirea investiției de timp.

## Ce are nevoie de Radu

| ce | de ce | stare |
|---|---|---|
| `RESEND_API_KEY` în `.env` | ca rapoartele și alertele să plece prin Resend, ca la celelalte proiecte. Fără ea, `notify-email.mjs` iese cu cod 2 și rutina trimite prin conectorul Gmail | de pus (aceeași cheie ca la celelalte proiecte) |
| proprietate în Google Search Console pentru `pricepertoken.ai` | cererile de indexare și cifrele de impresii | de verificat la prima rulare |
| aplicația Claude deschisă | rutinele Claude rulează doar atunci | — |

Nimic altceva. Nu e nevoie de niciun cont nou, de niciun serviciu plătit și de
niciun secret în GitHub.
