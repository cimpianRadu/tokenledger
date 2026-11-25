# Keyword research — august 2026

Sursă: DataForSEO (Google Ads search volume + Labs suggestions + SERP live),
locație US, limbă EN, măsurat 19 august 2026. Volumele sunt căutări/lună.

## Starea domeniului

| verificare | rezultat |
|---|---|
| indexare (`site:pricepertoken.ai`) | **10+ pagini indexate** — home, `/pricing/anthropic`, 8× `/compare/` |
| keyword-uri rankate (Labs) | **0** |
| domenii referente (backlinks) | **0** |
| vârsta site-ului live | 7 zile (12 aug 2026) |

Concluzia: nu e o problemă de indexare. E lipsă de vechime și de linkuri.
Google a găsit site-ul; n-are încă niciun motiv să-l urce peste site-uri cu
sute de domenii referente pe aceleași query-uri.

## Ce rankează acum pe termenul principal

SERP pentru `llm api pricing comparison`:

| # | domeniu | pagină |
|---|---|---|
| 1 | **pricepertoken.com** | `/` — "LLM API Pricing 2026 - Compare 300+ AI Model Costs" |
| 2 | costgoat.com | `/compare/llm-api` |
| 3 | yourgpt.ai | calculator |
| — | *AI Overview* | citează pricepertoken.com de 2×, plus benchlm.ai, opslyft, inference.net |
| 4 | benchlm.ai | `/llm-pricing` |
| 5 | llmpricecheck.com | `/` |
| 7 | helicone.ai | `/llm-cost` |
| 8 | artificialanalysis.ai | `/tools/llm-price-calculator` |

**pricepertoken.com** — nume aproape identic, `.com`, poziția 1, citat în AI
Overview, are deja o pagină `/cheapest`. Orice căutare de brand pentru "price
per token" duce la el. Ăsta e un risc strategic separat de SEO-ul de conținut.

## Volume măsurate

### Cluster „token counter" — cel mai bun fit, competiție minimă

| keyword | vol/lună | KD | trend |
|---|---|---|---|
| token counter | 5.400 | 19 | stabil |
| openai token counter | 590 | 29 | −64% yoy |
| claude token counter | 320 | **8** | **+86% yoy** |
| llm token counter | 320 | 17 | −46% |
| ai token counter | 260 | 19 | −19% |
| token counter openai | 260 | 30 | |
| gemini token counter | 170 | **9** | |
| chatgpt token counter | 140 | 17 | |
| anthropic token counter | 140 | **4** | +27% mtm |
| gpt token counter | 140 | 24 | |
| tokens to words | 110 | 1 | |

~7.800/lună cumulat, KD 4–30. Aici site-ul are un tool real, nu doar un tabel —
și pricepertoken.com **nu** acoperă clusterul ăsta.

### Cluster „pricing per furnizor" — volumul mare, competiția reală

| keyword | vol/lună | trend |
|---|---|---|
| anthropic api pricing | 2.900 | +81% yoy |
| chatgpt api pricing | 2.400 | −45% yoy |
| claude api cost | 1.600 | +82% yoy |
| openai api cost | 1.000 | stabil |
| free llm api | 1.000 | +14% |
| gpt api pricing | 880 | stabil |
| llm api | 880 | +22% |
| openai api pricing calculator | 720 | **3.600 în iulie** — explozie |
| cost per token | 320 | +255% yoy |
| cheapest llm api | 260 | +24% |
| llm api pricing | 170 | +29% yoy |
| llm pricing comparison | 170 | stabil |
| llm api pricing comparison | 140 | KD 20 |

### Informațional — singurul loc unde blogul chiar are sens

| keyword | vol/lună | KD | trend |
|---|---|---|---|
| **what is a token in ai** | **3.600** | 12 | +125% yoy (vârf 6.600 în mai) |
| tokens to words | 110 | 1 | |

CPC 2,47$ pe „what is a token in ai" vs 8–23$ pe termenii de pricing — trafic
mai ieftin, intenție mai slabă, dar e volum real pe care nimeni din top 8 nu-l
țintește cu o pagină dedicată.

## Ce lipsește din site

Rute existente: `/`, `/pricing/{provider}`, `/models/{model}`, `/compare/{pair}`.

1. **Nicio pagină `/cheapest`** — 260/lună direct, plus e pagina pe care
   pricepertoken.com o are citată în AI Overview.
2. **Niciun token counter per furnizor** — ~1.200/lună cumulat la KD 4–29,
   pe un tool care există deja.
3. **Nicio pagină pentru „what is a token in ai"** — 3.600/lună.
4. **Paginile `/compare/` indexate sunt perechile greșite** — Google a luat
   `command-r vs gpt-oss-120b`, `kimi-k2.5 vs sonar-pro`, `ministral-8b vs
   command-r`. `notableModels()` selectează după fereastra de context, ceea ce
   scoate modele fără cerere. Nimeni nu caută perechile astea.

---

# Coliziunea de brand cu pricepertoken.com

Măsurat 19 august 2026.

## Cine e concurentul

| | pricepertoken.ai | pricepertoken.com |
|---|---|---|
| domeniu înregistrat | ~iul. 2026 | **22 iulie 2025** (NameCheap) |
| live | 12 aug 2026 (7 zile) | ~2 ani de crawl |
| domenii referente | **0** | **581** (539 main, 130 nofollow) |
| backlinks | 0 | 2.494 |
| keyword-uri rankate | 0 | **1.439** |
| poziții #1 | 0 | 11 |
| top 5 | 0 | **132** |
| trafic organic estimat | 0 | ~2.560 vizite/lună |
| pagini crawlate | 841 (build) | 14.633 |

Nu te bate vechimea — are 13 luni. Te bate rata de acumulare: 581 domenii
referente în 13 luni înseamnă ~45/lună, susținut. Asta e ținta reală.

## Ce acoperă .com-ul și noi nu

Din cele 132 de poziții top-5, arhitectura lui arată așa:

| rută | exemplu care rankează |
|---|---|
| `/pricing-page/provider/{p}` | `openai price api` 390/lună, #5 |
| `/pricing-page/model/{m}` | `gpt-5 api pricing` 480/lună, #4 |
| `/image/author/{lab}` | `stability pricing` 1.300/lună, #4 |
| `/leaderboards/benchmark/{b}` | `humanity's last exam leaderboard` 320/lună, #5 |
| `/leaderboards/{topic}` | `best llm for math` 260/lună, #4 |
| `/` | `cost per token` 260/lună, **#1** · `cheapest llm api` 260/lună, #5 |

Două categorii întregi care ne lipsesc: **modele de imagine** (pe care le
monetizează pe autor/lab) și **leaderboards**. A doua e o alegere deliberată,
documentată în README, și rămâne corectă — n-ai cum să concurezi pe leaderboard
cu cine are 610 modele față de 246 ale tale.

## Ce **nu** acoperă

Niciuna dintre cele 132 de poziții top-5 nu e pe un termen din clusterul
`token counter` — ~7.800 căutări/lună la KD 4–30. El e un tabel de prețuri; noi
avem un tokenizer care rulează în browser. Acolo nu concurăm cu el, îl ocolim.

## Cât costă efectiv numele

| | vol/lună |
|---|---|
| `price per token` | 110 (vârf 480 în iunie) |
| `pricepertoken` | sub prag, nemăsurabil |
| `price per token ai` | sub prag, nemăsurabil |

Concluzia contraintuitivă: **coliziunea de nume nu costă trafic de brand**,
pentru că nu există trafic de brand — 110 căutări/lună pe termenul generic, și
zero pe numele scris legat. Nimeni nu caută niciunul dintre voi pe nume.

Ce costă e altceva:

1. **Entitatea.** Google a legat deja "Price Per Token" de `.com` — titlu, nume
   de site în SERP, citare în AI Overview. Orice semnal de brand pe care îl
   construiești (mențiuni, linkuri cu anchor „price per token", căutări) se
   scurge parțial spre el.
2. **Citarea în AI Overview.** Pe `llm api pricing comparison` AI Overview
   citează `pricepertoken.com` de două ori, inclusiv pagina lui `/cheapest`.
   Un al doilea „Price Per Token" în același răspuns nu se întâmplă.
3. **Credibilitatea la link building.** Când ceri un link, prima căutare pe care
   o face omul e numele. Găsește `.com`-ul.

## Concluzie

**Domeniul se ține.** Cele trei opțiuni pe care le cântărea prima versiune a
acestei secțiuni — rebrand, diferențiere, ambele — porneau de la presupunerea că
numele costă trafic. Măsurătoarea de mai sus arată că nu: 110 căutări/lună pe
termenul generic, nemăsurabil pe numele scris legat, la niciunul dintre cele
două site-uri. Nu există trafic de brand de pierdut.

`.ai` nu e nici el un handicap. În SERP-ul pe `llm api pricing comparison`,
pozițiile 3, 4, 7, 8 și 9 sunt `yourgpt.ai`, `benchlm.ai`, `intuitionlabs.ai`,
`helicone.ai` și `artificialanalysis.ai` — cinci din primele nouă.

Ce rămâne real, la mărimea corectă: `.com` deține entitatea „Price Per Token" în
indexul Google, deci `.ai` nu va fi citat în AI Overview pe termenii unde e
citat el. E un cost îngust, nu o barieră de ranking — și pe clusterul token
counter, unde `.com` n-are nicio poziție în top 5, nu se aplică deloc.

**Când se rediscută:** dacă în Search Console apar impresii pe `price per token`
sau pe numele scris legat, cu poziție medie proastă. Până atunci un rebrand ar
rezolva o problemă care încă nu produce pierdere.

**Ce închide de fapt ecartul:** 581 domenii referente vs 0. Aia e toată
diferența, și niciun nume nou n-o închide. De-aia paginile de token counter sunt
mișcarea corectă — KD 4–9 înseamnă că pot rankeza înainte să existe linkuri.
