# icpebook.org — strona książki „A Cast of Light” (Astro)

Statyczna strona książki Anny Cappello Favy w 5 językach. Ten sam stos co `site/` (icpemission.pl),
ale osobny projekt: bez API, cała treść w plikach.

## Gdzie co jest

| Co | Plik |
|---|---|
| Teksty (każdy język osobno) | `src/i18n/en.ts`, `pl.ts`, `it.ts`, `es.ts`, `ko.ts` |
| Linki, wydania, wydarzenia, galeria, PDF-y, newsletter | `src/config.ts` |
| Wygląd i zachowanie strony | `src/components/BookPage.astro` |
| Zdjęcia, okładka, PDF | `public/img/…`, `public/files/…` |

Adresy: `/` (EN), `/pl/`, `/it/`, `/es/`, `/ko/`. Stare adresy z Wixa (`/endorsements`, `/gallery`,
`/copy-of-…`, `/<lang>/endorsements`) przekierowują na sekcje (astro.config.mjs → `redirects`).

### Typowe zmiany
- **Nowe wydanie / zmiana statusu** (np. włoskie dostępne): `EDITIONS` w `src/config.ts` → `status: 'available'`, `href`.
- **Nowe wydarzenie**: dopisz do `EVENTS` (data, godzina, miejsce, link Lumy). Po dacie pasek i sekcja znikają same.
- **PDF z fragmentami / modlitwami**: wrzuć plik do `public/files/` i wpisz ścieżkę w `RESOURCES`.
- **Newsletter (Brevo)**: wklej adres `action` formularza do `NEWSLETTER_ACTION`. Puste = przycisk „napisz do nas”.
- **Polska okładka**: podmień `public/img/cover.jpg` (proporcja ok. 2:3).

## Uruchomienie lokalne

```bash
cd book
npm install
npm run dev     # http://localhost:4321
npm run build   # wynik w book/dist
```

## Wdrożenie — Render Static Site (jak icpemission.pl)

1. Render ▸ **New ▸ Static Site** ▸ to samo repo.
2. **Name:** `icpe-book` · **Root Directory:** puste.
3. **Build Command:** `cd book && npm install && npm run build`
4. **Publish Directory:** `book/dist`
5. **Environment:** `SITE_URL=https://www.icpebook.org`
6. Settings ▸ **Custom Domains**: dodaj `www.icpebook.org` i `icpebook.org`.

### Domena (przeniesienie z Wixa)
Domena jest teraz podpięta do Wixa. U rejestratora domeny (albo w Wix ▸ Domains, jeśli domena
jest kupiona w Wixie — wtedy DNS edytuje się tam):
- `www` → **CNAME** na adres `icpe-book.onrender.com` (Render pokaże dokładny),
- domena główna `icpebook.org` → rekord **A** na adres IP podany przez Render (albo ALIAS/ANAME),
- usuń stare rekordy Wixa dla `www` i `@`.
Render sam wystawi certyfikat HTTPS. Do czasu przełączenia DNS strona działa pod `icpe-book.onrender.com`.

Uwaga: subskrybenci newslettera z Wixa zostają w Wixie — wyeksportuj listę (Wix ▸ Kontakty) przed rezygnacją z planu.
