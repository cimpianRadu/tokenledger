# Price Per Token

Comparator de preț per token pentru API-uri LLM. Astro + o insulă React pentru tool.

## Rulare

```bash
npm install
npm run sync    # trage prețurile din datasetul public LiteLLM
npm run dev
```

`npm run sync` scrie `src/data/models.json`. Rulează-l înainte de fiecare build —
e singura sursă de adevăr pentru prețuri, și e cronjob-abil.

```bash
export ARTIFICIALANALYSIS_API_KEY=...   # cont gratuit, 1.000 requests/zi
npm run sync:bench
```

`npm run sync:bench` scrie `src/data/benchmarks.json` — scoruri de capabilitate
măsurate independent. E **opțional**: fără cheie scriptul iese curat, fișierul
rămâne gol și secțiunile de capabilitate pur și simplu nu se randează. Build-ul
trece fie așa, fie așa.

## Ce generează

| rută | pagini | de unde vine volumul |
|---|---|---|
| `/` | 1 | `token counter` 5.400/lună, bid până la $23 |
| `/pricing/{provider}` | 12 | `claude api pricing` 6.600/lună, în creștere |
| `/models/{model}` | 249 | long-tail pe nume de model |
| `/compare/{a}-vs-{b}` | 561 | intenție de comparație, bid mai bun |

824 pagini statice, build în ~8s.

## Validare

```bash
npm run check          # doar datele
npm run build          # build + validare pe output (rulează automat)
```

`scripts/validate.mjs` pică build-ul pe:

- date de preț mai vechi de 30 de zile
- slug sau nume de model duplicat în același furnizor
- `providerSlug` fără pagină corespunzătoare (linkuri moarte)
- furnizor rămas cu zero modele — așa dispăruse Cohere, cheia din LiteLLM e `cohere_chat`, nu `cohere`
- snapshot datat nepliat peste aliasul lui
- linkuri interne rupte, titluri duplicate, `<title>` / canonical / description lipsă
- titluri care nu mai conțin keyword-ul pentru care a fost făcută pagina
- scor de benchmark în afara intervalului 0–100, sau atașat unui slug care nu
  mai există (mapping-ul spre Artificial Analysis a driftat)

Datele de benchmark au regulă de vechime **mai blândă** decât prețurile:
avertisment la 90 de zile, nu `FAIL` la 30. Un scor nu se strică — un preț da.
Ce îmbătrânește e acoperirea modelelor noi, și aia e o notă, nu o pagină greșită.

Ultima e cea mai utilă pe termen lung: dacă cineva rescrie titlul paginii
Anthropic și scoate „claude api pricing", build-ul pică. Ținta de 6.600
căutări/lună nu se pierde în tăcere.

Avertismentele repetitive se grupează, ca să nu îneci un `FAIL` real în 186 de
note despre lungimea titlului.

## Deciziile care contează

**Comparator, nu calculator.** Formula de tokenizare e publică și un LLM ți-o
rezolvă. Prețurile curente nu — se schimbă lunar și niciun model nu le știe.
Șanțul e `npm run sync`, nu codul.

**Onestitatea ca diferențiator.** Mai multe site-uri concurente folosesc
tokenizer-ul cl100k pentru toate modelele și tac. Aici fiecare model are un
badge `exact` sau `estimated`, iar footer-ul spune de ce. Numai OpenAI publică
tokenizer; restul sunt aproximări cu raport declarat în `DRIFT` din
`src/components/Ledger.tsx`.

**Numele pe care îl caută lumea, în titluri.** Fiecare furnizor are un câmp
`brand` care conduce title, H1, meta și schema. Uneori e familia de modele
(„claude api pricing" 6.600/lună bate „anthropic api pricing" 2.900), alteori e
firma („openai" 9.900 bate „gpt" 880, „perplexity" 720 bate „sonar" 20).
Regula nu se ghicește — volumele măsurate sunt în `scripts/sync-pricing.mjs`,
iar `KEYWORD_TARGETS` din `scripts/validate.mjs` pică build-ul dacă un titlu
pleacă de pe termenul pentru care a fost făcut.

**Ranking după context, nu după preț.** Modelele vechi rămân listate la
tarifele lor vechi — Opus 4.1 e $15/$75 în timp ce Opus 5 e $5/$25 — așa că
„cel mai scump" selecta fix modelele pe care nu le mai compară nimeni.
Fereastra de context e cel mai bun indicator de recență din dataset.

**Benchmark-urile servesc concluzia de preț, niciodată invers.** Scorurile sunt
commodity — orice leaderboard le republică. Prețul proaspăt nu e. Deci nu
există rută `/benchmarks/` și nu există leaderboard propriu: capabilitatea apare
doar lipită de preț, în verdictul „merită să plătești în plus?" de pe paginile
de compare. Un leaderboard aici ar concura cu site-uri care au 381 de modele
față de 34 ale noastre, pe terenul lor.

Corolarul de onestitate: nu se scrie niciun scor pe care nu l-a măsurat cineva.
Dacă un model n-are măsurătoare, perechea rămâne o comparație de preț —
`readCapability` întoarce `null` și secțiunea dispare. Jumătate de dovadă e mai
rea decât nicio dovadă.

**Paginile de compare sunt limitate deliberat.** Produsul cartezian pe tot
catalogul ar fi ~30.000 de pagini aproape identice. `notableModels(3)` taie la
modele curente cu context ≥100K, maxim 3 per furnizor → 561 perechi.

**Un model, un rând.** Furnizorii publică același model sub mai multe ID-uri:
`gpt-5-nano-2025-08-07`, `jamba-1.5-mini@001`, `gemini-2.5-flash-preview-09-2025`.
`scripts/lib/aliases.mjs` decide ce e alias, sync-ul le pliază pe rândul de bază
(numele rămâne pe pagină, pentru căutare), iar validatorul pică build-ul dacă
scapă vreunul. `-latest` **nu** e alias: la Mistral și xAI e ID-ul principal.

## Ce urmează

1. Tokenizare reală per familie unde e posibil — ăsta e unicul lucru care te
   diferențiază tehnic, și e și motivul pentru care badge-urile există.
2. AI21 nu are cerere măsurabilă sub niciun nume (Jamba 0, AI21 10/lună).
   Pagina rămâne pentru completitudine, nu pentru trafic.
3. Referral spre un gateway (OpenRouter, LLMGateway) în locul bannerelor —
   publicul de dev blochează reclamele, dar dă click pe infrastructură.
