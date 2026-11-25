# Coada de conținut

Rutina `tokenledger-continut` ia **prima** linie `- [ ]` din „## Coadă", o
construiește, o publică și o bifează. Rutina `tokenledger-keywords` adaugă
linii noi la sfârșit, în fiecare lună, numai cu volume măsurate.

Formatul unei linii:

```
- [ ] /ruta — `keyword principal` N/lună (KD k, măsurat YYYY-MM) · [tip] · ce arată pagina
```

## Reguli care nu se negociază

1. **Nicio cifră inventată.** Tot ce apare pe pagină vine din `src/data/`
   (prețuri, istoric, scoruri) sau din tokenizer-ul care rulează în browser.
   Dacă un item cere date pe care site-ul nu le are, nu-l construi: scrie în
   „## Jurnal" ce lipsește și treci la următorul.
2. **O pagină, un keyword măsurat.** Dacă volumul nu e în linia din coadă, se
   măsoară cu DataForSEO înainte, nu se presupune.
3. **Titlul poartă keyword-ul** și intră în `KEYWORD_TARGETS` din
   `scripts/validate.mjs`, altfel o rescriere viitoare îl poate pierde în
   tăcere.
4. **Badge-ul `exact` / `estimated`** apare oriunde se arată un număr de tokeni.
   Onestitatea e diferențiatorul site-ului; o pagină care o pierde face rău, nu
   bine.
5. `npm run build` trebuie să treacă (face și validarea pe output). Dacă pică
   și nu se repară curat, nu se dă push.

## Coadă

- [ ] /what-is-a-token — `what is a token in ai` 4.400/lună (KD 12, măsurat 2026-11) · [explainer] · ce e un token, cu numărătoarea live din tokenizer, raportul real pe familie și cât costă 1.000 de tokeni azi la fiecare furnizor. Niciunul din primele 8 rezultate n-are pagină dedicată.
- [ ] /tokens-to-words — `tokens to words` 110/lună (KD 1, măsurat 2026-08) + `how many tokens is 1000 words` · [tool] · convertor în ambele sensuri pe tokenizer-ul real, cu tabel pe familii și notă că proza, codul și diacriticele se numără diferit.
- [ ] /pricing-history — `llm price history`, `cost per token` 320/lună (+255% an/an, măsurat 2026-08) · [date] · evoluția prețurilor din `src/data/history.json`, care crește singur cu fiecare sync lunar. E singura pagină pe care nimeni n-o poate copia din fișierul public LiteLLM.
- [ ] /pricing/openai/calculator — `openai api pricing calculator` 720/lună (vârf 3.600 în iulie 2026, măsurat 2026-08) · [tool] · calculator de cost pe volum lunar pentru modelele OpenAI, pe prețurile curente, cu cache-ul separat.
- [ ] /cheapest/coding — `cheapest llm for coding` (de măsurat) · [date] · cel mai ieftin model care trece pragul de livecodebench, adică exact întrebarea pe care `/cheapest` o lasă deschisă. Dacă nu sunt scoruri pentru modelele curente (vezi README, sursa de benchmark s-a închis), sari peste și loghează.
- [ ] /free — `free llm api` 1.000/lună (+14%, măsurat 2026-08) · [BLOCAT] · nu există sursă de date pentru nivelurile gratuite în LiteLLM. Nu construi până nu apare una; a enumera din memorie ar încălca regula 1.

## Jurnal

| data | ce s-a publicat | indexare | note |
|---|---|---|---|
| 2026-11-25 | /token-counter/ + 12 pagini pe furnizor, /cheapest | IndexNow 855 URL | lansate din lucrul nepublicat din august |
