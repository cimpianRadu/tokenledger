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

**Brand, nu firmă, în titluri.** Lumea caută „claude api pricing", nu
„anthropic api pricing". Fiecare furnizor are un câmp `brand` (Claude, Grok,
Kimi, Sonar) care conduce title, H1, meta și schema. Numele firmei rămâne în
corpul paginii.

**Ranking după context, nu după preț.** Modelele vechi rămân listate la
tarifele lor vechi — Opus 4.1 e $15/$75 în timp ce Opus 5 e $5/$25 — așa că
„cel mai scump" selecta fix modelele pe care nu le mai compară nimeni.
Fereastra de context e cel mai bun indicator de recență din dataset.

**Paginile de compare sunt limitate deliberat.** Produsul cartezian pe 249 de
modele ar fi ~31.000 de pagini aproape identice. `notableModels(3)` taie la
modele curente cu context ≥100K, maxim 3 per furnizor → 561 perechi.

## Ce urmează

1. Schimbă `SITE` în `astro.config.mjs` înainte de deploy.
2. Tokenizare reală per familie unde e posibil — ăsta e unicul lucru care te
   diferențiază tehnic, și e și motivul pentru care badge-urile există.
3. Verifică brandurile mici (Sonar, Command, Jamba) cu keyword research — le-am
   pus din intuiție, nu din date măsurate.
4. Referral spre un gateway (OpenRouter, LLMGateway) în locul bannerelor —
   publicul de dev blochează reclamele, dar dă click pe infrastructură.
