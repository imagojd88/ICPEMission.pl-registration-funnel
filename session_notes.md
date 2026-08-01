# Session Notes — ICPEMission.pl

> Dziennik prac projektu. **Zasada: każda sesja dopisuje tu swoje zmiany** (co zrobione, gdzie, dlaczego, stan wdrożenia). Najnowsze wpisy na górze sekcji.

---

## Stack i wdrożenie (skrót)

- **Monorepo** npm workspaces: `app/` (React 18 + Vite + TS + Tailwind), `api/` (NestJS 10 + Prisma + PostgreSQL), `shared/` (kontrakt + silnik wyceny).
- **Vendored shared:** `api/` importuje z `'../shared'` = `api/src/_shared/` — musi być lustrem `shared/src/` (silnik pricingu).
- **Baza:** Render Postgres `icpe-db` na planie **basic-256mb** (podniesiona z free w sierpniu 2026). W `render.yaml` musi być `plan: basic-256mb` — wpisanie `free` psuje CAŁY sync Blueprintu (`cannot downgrade database from Basic-256mb to Free`) przy każdym pushu.
- **Backend:** Render Web Service `icpe-api` (Blueprint/`render.yaml`). **Auto-Deploy domyślnie WYŁĄCZONY** → po zmianach w backendzie trzeba **Manual Deploy** (zalecane włączyć Auto-Deploy). API URL: `https://icpe-api.onrender.com`.
- **Frontend:** Render Static Site `icpe-frontend` — auto-deploy po pushu.
- **Prisma:** zmiany schematu wchodzą przez `prisma db push` przy starcie Render (nowe nullable pola/tabele dodają się same).
- **CORS:** `origin: true` w `main.ts`.
- **SMTP:** nodemailer przez dynamiczny import + ambient shim (`api/src/nodemailer-shim.d.ts`). Konfiguracja przez ENV na Render (`MAIL_MODE=smtp`, `SMTP_HOST/PORT/USER/PASS/SECURE`, `MAIL_FROM`) jako `sync:false` w `render.yaml`. Dostawca: **Brevo** — UWAGA: NIE włączać blokowania nieautoryzowanych IP (Render ma dynamiczne IP).

### Ograniczenia sandboxa (dla przyszłych sesji)
- `npm install` w sandboxie zawodzi (FUSE ENOTDIR); `git` z sandboxa zawodzi (FUSE lock) → **user robi push**.
- `prisma generate` zwraca 403 na silniku (checksum) — nieszkodliwe, typy się generują.
- `vite build` na zamontowanym katalogu potrafi paść na `rimraf` (FUSE) → budować z `--outDir /tmp/...`.
- Weryfikacja: `npx tsc --noEmit` per workspace + `npx vite build`.

### Komenda push (user)
```bash
cd "/Users/jacekdudzic/Documents/Claude/Projects/ICPEMission.pl registration funnel" && git add -A && git commit -m "<opis>" && git push
```

---

## Wzorce przechowywania danych

- `EventSeries.type` — typ eventu: `ONE_TIME` | `STANDALONE` | `INVITE`.
- `RegistrationPage.theme` (JSON): `primaryColor, heroImageUrl, titleColor, badge, supertitle`.
- `RegistrationPage.paymentInfo` (JSON): `{ recipient, account }` — dane przelewu per event.
- `RegistrationPage.customFields` (JSON): `{ program: [{time,item}], specialGuest: {name, photoUrl, plural?, bio?} }` — `plural` przełącza etykietę „Gość specjalny"/„Goście specjalni", `bio` to mapa językowa (1–2 zdania o gościach).
- `pricingConfig` (JSON): dodane `free?: boolean` (event bezpłatny).
- `Registration`: `checkedInAt`, `roomLabel`, `roomNote`, `roomsJson`.
- `Invitation` (model): `token @unique`, `confirmedAt`, `dietaryNotes`.
- `Place` (model): zapisywane lokalizacje `{ id, label, createdAt }`.

---

## Dziennik prac — strona ICPE Mission PL (CMS)

### Rotacja cytatów „Kim jesteśmy" zwolniona (2026-08-01)
- Interwał rotatora cytatów w `index.astro`: 8000 → 16000 ms (user: trudno nadążyć z czytaniem). Hover nadal pauzuje. Build OK.

### Poprawki treści landingu — 7 zmian PL/EN (2026-08-01)
- **Bogotá → Medellín** wszędzie: ticker (`index.astro`), pinezka mapy (`WorldMap.astro`: nazwa + współrzędne 6.24/-75.58), seed (`community-seed.ts`). **Klucz `bogota` celowo bez zmian** (łączy z istniejącym rekordem opisu w CMS; seed i tak działa tylko na pustej bazie). Nazwa w panelu CMS w bazie nadal „Bogotá" — mapa bierze nazwę z kodu, więc bez wpływu na stronę; ewentualnie poprawić ręcznie w Personal OS.
- **Ticker dwujęzyczny**: rozbity na `data-pl`/`data-en`; EN: „Seoul · Singapore". Pinezki mapy: `name` → „Seoul", „Singapore" (jedno pole dla obu języków — decyzja usera; `ccPl` „Singapur" jako kraj zostaje).
- **Kim jesteśmy**: EN dodane „founded in Malta by Mario and Anna Cappello with a small group of courageous companions in 1985"; PL analogicznie („przez Mario i Annę Cappello wraz z niewielką grupą odważnych towarzyszy").
- **Nad mapą**: „One community · one world" → „Our locations around the globe" (poprawiona literówka usera „our the globe" — potwierdzone); PL → „Nasze wspólnoty na całym świecie". H2 „From Malta to Wellington." → „Institute For World Evangelisation"; PL → „Instytut Ewangelizacji Świata".
- **Stopka**: „Part of the Institute…" → „Institute for World Evangelisation – ICPE Mission."; PL bez „Część".
- **CTA**: „Write to the Warsaw community…" → „Drop us a line or visit us at one of our events."; PL → „Napisz do nas lub odwiedź nas…".
- Weryfikacja: astro build + check = 0 błędów (build z kopii w /tmp — `npm install` na FUSE zawodzi), grep w dist/index.html potwierdza wszystkie nowe teksty i brak starych; api `tsc --noEmit` OK.
- Wdrożenie: push → auto-deploy static-site strony; zmiana w `community-seed.ts` czysto kosmetyczna dla istniejącej bazy (Manual Deploy `icpe-api` niekonieczny).

### Poprawki treści landingu (tagi mapy, zdania)
- Tagi wspólnot na mapie: usunięte „Oddział · …", „Ten dom · hub", „Serce wspólnoty", „Fraternia", „Oddział · od 1996" → zostaje sam kontynent (Europa/Azja/Afryka/Oceania/Ameryka Płn./Ameryka Płd. + EN). Zmienione w DWÓCH miejscach: `WorldMap.astro` (dane bazowe/fallback) i `api/src/content/community-seed.ts` (seed CMS) — żeby po wdrożeniu Community CMS nie nadpisał nowych wartości starymi.
- Zdanie nad mapą → „ICPE Warszawa to jedna z 23 wspólnot Instytutu Ewangelizacji Świata – ICPE Mission na świecie. Zobacz, gdzie jeszcze jesteśmy obecni." (+ EN).
- Zdanie w CTA → „Napisz do wspólnoty warszawskiej lub odwiedź nas na jednym z naszych wydarzeń." (+ EN).
- Weryfikacja: astro build + check = 0 błędów, api tsc OK.
- „Napisz do nas" → **mailto** `warszawa@icpemission.pl` (wybór usera). Antyspam: adres jako base64 w `data-mail`, `mailto:` (z tematem „Kontakt — ICPE Mission Warszawa") składany w JS przy załadowaniu → w źródle HTML brak wzorca „x@y" (zweryfikowane: 0 wystąpień plaintextu). Podpięte: przycisk w nawigacji, przycisk w banerze CTA, oraz zakodowany link w stopce (JS pokazuje adres jako tekst). Fallback bez JS: `href="#kontakt"` (scroll do stopki). Klasa `.js-mail` + skrypt w index.astro.

### Hero: 3 dodatkowe zdjęcia + sterowanie z CMS (SiteSettings.hero)
- Dodane hero_3/4/5.jpg do rotacji (razem 5 slajdów; object-position dobrane pod kadr 420px).
- Hero przeniesione z hardcode na CMS: `SiteSettings.hero` Json `{ rotate, defaultUrl, images:[{url,position?,alt?}] }`. Backend: schema + `getSettings` zasiewa DEFAULT_HERO (5 obecnych zdjęć) przy pierwszym odczycie; `putSettings` przyjmuje `hero`. `content.service.ts`.
- Astro `index.astro`: `getSettings()` przy buildzie → render hero z `hero.images`; `rotate=false` → tylko domyślne (defaultUrl lub pierwsze). Fallback do 5 wbudowanych, gdy API puste/down. Crossfade CSS/JS bez zmian.
- URL zdjęć: zasiane = względne `/uploads/*` (statyki strony); nowe z Personal OS = PEŁNY URL `${API_BASE}/uploads/:id` (strona i API to różne domeny!).
- Handoff dla Personal OS: `docs/09-prompt-personal-os-hero.md` (sekcja Hero w Ustawieniach: toggle rotacji, dodaj/usuń zdjęcie, oznacz domyślne).
- Po pushu: Manual Deploy `icpe-api` (nowa kolumna `hero` + seed). Do tego czasu strona i tak pokazuje 5 zdjęć (fallback).

### „Kim jesteśmy" — rotator cytatów
- Blok cytatu (dot. założycieli) zamieniony na rotator: `.quotes[data-quotes]` z `<figure class="quote">` (każdy = cytat PL/EN + podpis: zdjęcie opcjonalne + nazwa + rola PL/EN). Pierwszy = założyciele (`is-active`), zawsze na starcie.
- CSS: `.quote{display:none}`, `.quote.is-active{display:block; @keyframes quoteFade}`, `.quote-dots button(.is-on)`.
- JS (is:inline w index.astro): auto-rotacja co 8s tylko gdy >1 cytat, pauza na hover, kropki budowane dynamicznie; przy 1 cytacie kropki ukryte i brak rotacji. Język przez CSS (data-pl/data-en).
- DO DODANIA: kolejne cytaty od usera — wstawiać `<figure class="quote">…</figure>` przed `<div class="quote-dots">`. Format cytatu: tekst PL + EN, nazwa autora, rola PL + EN, opcjonalnie zdjęcie (URL w /uploads).
- Cytat #2: ks. Sławomir Pawłowski SAC (PL/EN, bez roli). Zdjęcie: `site/public/uploads/ks-pawlowski.jpg` (user zapisuje sam — plik niedostępny z sesji).
- Cytat #3: John Paul, ICPE Mission Warszawa/Warsaw (name + rola). Zdjęcie: `site/public/uploads/john-paul.jpg` (user zapisuje; to szeroka fotka ze sceny → mocny zoom w okrągłym kadrze, object-position 48% 27%). Drobne poprawki gramatyczne w EN (helped me grow / to make him known / przecinki) — do rewertu jeśli user chce verbatim. Rotacja: 3 slajdy, założyciele zawsze pierwsi.

### Stopka — linki zewnętrzne + social
- Przebudowa stopki na 4 kolumny (marka+e-mail, Nawigacja, „ICPE w sieci", „Social"); na mobile 1 kolumna.
- ICPE w sieci: ICPE International (icpe.org), ICPE Book (icpebook.org), HopeXchange (hopexchangemedicalcenter.org).
- Social: Instagram (icpemission360), FB ICPE Warszawa (id=61583565058942), FB Seminary (ICPEMissionSeminary), FB ICPE 360 (id=100068380218392). Wszystkie `target="_blank" rel="noopener noreferrer"`.
- E-mail (mailto base64) przeniesiony do kolumny marki.

### Domena icpemission.pl podpięta (ZROBIONE przez usera)
- DNS (nameservery aderlo.cloud): apex `icpemission.pl` A → 216.24.57.1 (Render), `www` CNAME → icpe-site.onrender.com. Uwaga: na apexie NIE dawać CNAME (kolizja z MX/NS/TXT) — użyto rekordu A wg alternatywy Rendera. Rekordy Brevo/poczty (MX, SPF, DKIM brevo1._domainkey + x._domainkey, _dmarc, @ TXT brevo-code, mail/smtp/pop) nietknięte. `rejestracja` CNAME → icpe-frontend.onrender.com bez zmian.
- Zweryfikowane z zewnątrz: `https://icpemission.pl` serwuje landing po HTTPS, canonical/OG = https://icpemission.pl/, SSL OK. Strona produkcyjna.
- Do domknięcia (opcjonalnie): redirect www↔apex w Render (wybór głównej), `SITE_URL` env (canonical i tak już poprawny z astro.config).

### Fix: piny mapy stłoczone u góry (Astro scoped styles vs elementy z JS)
- Objaw na produkcji: canvas mapy (lądy, siatka, łuki) OK, ale piny/etykiety/chipy stłoczone u góry mapy.
- Przyczyna: Astro scopuje style komponentu (atrybut `data-astro-cid-*` na elementach z szablonu), a piny/kropki/pierścienie/etykiety/chipy tworzę dynamicznie w JS — te elementy nie mają atrybutu scope, więc reguły `.wm-pin{position:absolute}` itd. do nich nie trafiały → bez `position:absolute` `left/top%` ignorowane → flow u góry.
- Fix: w `WorldMap.astro` `<style>` selektory elementów tworzonych w JS zmienione na `:global(.wm-pin/.wm-ring/.wm-dot/.wm-label/.wm-chip)`. Zweryfikowane w zbudowanym HTML: reguły globalne (0 wystąpień ze scope).

### Mapa: overlay CMS tylko dla opisu + poprawki etykiet
- Zmiana architektury: `applyOverlay` w WorldMap nakłada z CMS TYLKO `note` (n_pl/n_en). Nazwa/kraj/tag/współrzędne = stałe w kodzie strony. Powód: tagi zasiane w CMS starymi wartościami nadpisywały baked → wcześniejsze zmiany tagów nie były widoczne. Teraz tagi/kraje są kod-kontrolowane, opisy nadal z CMS.
- Warszawa tag: „Europa" → „To my · Polska" / „This is us · Polska".
- Malta kraj: „Malta · dom macierzysty" → „Malta · kolebka Instytutu Ewangelizacji Świata - ICPE Mission" (+ EN „cradle of…").
- Etykieta listy chipów: „Wszystkie oddziały" → „Tam jest ICPE" / „Where ICPE is".
- Handoff 07 zaktualizowany: z CMS edytowalny jest tylko OPIS wspólnoty (name/cc/tag read-only na stronie).

### Opisy wspólnot: obsługa linków <a href> (sanityzacja)
- `WorldMap.astro`: opis (`.wm-note`) renderowany przez `sanitizeNote()` zamiast `textContent`. Dozwolone tagi: `a[href]`, `b/strong/i/em/br`; reszta rozpakowywana do tekstu. Linki tylko `http(s)`, wymuszone `target="_blank" rel="noopener noreferrer nofollow"` + styl terakota/underline. Bezpieczne (brak script/js: URL). Treść z CMS (trusted admin), więc innerHTML akceptowalny po sanityzacji.

### Edytowalne opisy wspólnot mapy (z Personal OS)
- Wymóg usera: opisy pod mapą (hover/klik) edytowalne z CRM. Struktura mapy (współrzędne/piny) zostaje w kodzie; teksty z CMS.
- Backend: Prisma model `Community` (key unikalny, name, ccPl/En, tagPl/En, notePl/En @Text, lat, lng, grp, order). Seed 19 (`api/src/content/community-seed.ts`) auto-upsert przy pierwszym GET (gdy tabela pusta). ContentService: `listCommunities`, `updateCommunity` (PATCH pól tekstowych + trigger rebuild), `publicCommunities`. Endpointy: `/admin/content/communities` (GET, PATCH :id) + `/site/communities`. Rejestracja: bez zmian (w ContentModule).
- Astro: `getCommunities()` w api.ts; `WorldMap.astro` pobiera przy buildzie i wstawia jako `data-communities` (JSON) na kontenerze; klient `applyOverlay` nakłada po `key` na dane bazowe (name/cc/tag/note), fallback do wbudowanych gdy API puste. Klucze KEYS w kolejności DATA.
- Edycja opisu w Personal OS → PATCH → rebuild strony (Deploy Hook) → mapa pokazuje nowy tekst.
- Prompt `docs/07` rozszerzony o sekcję „Wspólnoty mapy". Weryfikacja: api tsc OK (Prisma stub), astro build + check = 0 błędów.
- Po pushu: Manual Deploy `icpe-api` (nowa tabela Community) + rebuild strony (albo poczekać na Deploy Hook).

### Landing „ICPE Mission Warszawa" wg design handoffu (statyczny one-pager)
- Źródło: `/Users/jacekdudzic/Downloads/design_handoff_icpe_polska` (README + `ICPE Polska - Wieczernik.dc.html` + `WorldMap.dc.html` + screenshots + assets/uploads). Ustalenie usera: na razie statyczny one-pager; CMS zostaje na przyszłe treści.
- Styl: ciepły editorialowy — tło `#F4EEE3`, akcent terakota `#C0603C`, ink `#241E1A`; fonty Bricolage Grotesque + Instrument Serif (italic akcent) + Space Mono. Dwujęzyczny PL/EN (przełącznik CSS `data-lang`, treść w `data-pl`/`data-en`).
- `site/src/pages/index.astro` → pełny landing (nav sticky + PL/EN + CTA, hero + cytat biblijny, hero image + ticker miast, „Kim jesteśmy" + założyciele + statystyki 2×2, 4 filary, ciemna sekcja mapy, triptych 3 zdjęć, 4 karty „Czego możesz doświadczyć", baner CTA, stopka). Inline style verbatim z handoffu = pixel-fidelity. Responsywność: gridy → 1 kol. na mobile.
- `site/src/layouts/LandingLayout.astro` — head (fonty, SEO/OG), bez CMS-owego Nav/Footer (landing ma własne).
- `site/src/components/WorldMap.astro` — port `WorldMap.dc.html` do czystego JS (`is:inline`): projekcja equirectangular, kropki lądów (LAND), łuki hub→oddziały na canvasie, piny jako buttony (Warszawa=hub pulsujący, PL=akcent, Malta/Fraternia=złoto, reszta=neutral), panel opisu (hover/klik, `hoverId ?? activeId`), chipy (kolejność: Warszawa/Kraków/Lublin/Malta/Fraternia, reszta alfabet.), dane 19 wspólnot PL/EN, reakcja na zmianę języka (MutationObserver).
- `site/src/styles/global.css` — przemapowane na ciepłą paletę + fonty + CSS przełącznika `data-lang` + `@keyframes wm-pulse`.
- Grafiki skopiowane do `site/public/assets` i `site/public/uploads` (globusy + 5 zdjęć). UWAGA licencje: część zdjęć to Unsplash/stock — potwierdzić prawa przed produkcją (flagowane w handoffie).
- Weryfikacja: `astro build` OK + `astro check` = 0 błędów (w /tmp; skrypty mapy/toggle jako `is:inline` → nie są typowane strict). Do eyeballa po deployu: interaktywność mapy i pixel-fidelity sekcji.
- CMS (index-owy „home" z `/site/*`) zastąpiony landingiem; `/aktualnosci` i `/{slug}` dalej z CMS. Uwaga: strony CMS używają BaseLayout ze starymi fontami (Newsreader/Plus Jakarta) — do ujednolicenia z brandem przy okazji.

### Wdrożenie strony (Render Static Site) — ZROBIONE przez usera
- Static Site założony na Render: Root puste, Build `cd site && npm install && npm run build`, Publish `site/dist`, ENV PUBLIC_API_URL/PUBLIC_REGISTRATION_URL/SITE_URL. Deploy Hook wpięty do `icpe-api` jako `SITE_DEPLOY_HOOK_URL`.
- Do weryfikacji przy okazji: pierwszy build zielony + strona się serwuje; realny test Deploy Hooka nastąpi przy pierwszej publikacji treści z Personal OS (Faza 3).

### Faza 2: szkielet publicznej strony (Astro, SSG)
- Nowy projekt `site/` (Astro 4, output static). Buduje się z `/site/*` i weryfikuje czysto: `astro build` OK + `astro check` = 0 błędów (walidacja w /tmp, bo w mount npm install pada na FUSE).
- `site/src/lib/api.ts` — fetch `/site/*` (defensywny: pusta treść zamiast wywalonego builda, gdy API down), helpery `pickLang`, `formatDateRange`. ENV: `PUBLIC_API_URL`, `PUBLIC_REGISTRATION_URL`, `SITE_URL`.
- `BaseLayout.astro` (head/SEO/OG, fonty Newsreader+Plus Jakarta Sans, Nav+Footer, placeholder Umami), `Nav`, `Footer`, `Blocks` (dispatcher: heading/paragraph/image/gallery/quote/button/eventCta/video/divider), `EventCard`.
- Strony: `index.astro` (home = Page slug „home" + najbliższe wydarzenia z `/site/events/upcoming` + 3 aktualności), `[slug].astro` (getStaticPaths z `/site/pages`, bez „home"), `aktualnosci/index.astro` + `[slug].astro`.
- `global.css` — tokeny brandu ICPE (light) spójne z aplikacją.
- Deploy (do zrobienia przez usera): Render Static Site, Root `site`, Build `npm install && npm run build`, Publish `site/dist`, ENV jw. Po utworzeniu skopiować Deploy Hook do `icpe-api` jako `SITE_DEPLOY_HOOK_URL`. Instrukcja: `site/README.md`.
- Handoff zaktualizowany: §0 + Faza 2 ✅. Następne: Faza 3 (UI treści w Personal OS), 4 (Umami).

### Faza 1: moduł `content` w icpe-api (backend CMS)
- Cel: API dla Personal OS do zarządzania treścią publicznej strony (patrz `docs/HANDOFF-strona-ICPE-Mission-PL.md`).
- Prisma (`api/prisma/schema.prisma`): enum `ContentStatus {DRAFT,PUBLISHED}` + modele `Page`, `Article`, `MenuItem`, `SiteSettings` (singleton id="singleton"). Nowe tabele → wejdą przez `prisma db push` na starcie Render.
- Nowy moduł `api/src/content/`: `content.service.ts` (CRUD Page/Article, publish/unpublish z triggerem rebuildu, preview, zapytania publiczne tylko PUBLISHED, menu putMenu = replace-all, settings upsert singleton), `content.admin.controller.ts` (`/admin/content/*`, `JwtAuthGuard`), `content.public.controller.ts` (`/site/*`, publiczne; `/site/events/upcoming` reużywa `EventsService.listPublicActive()`), `deploy-hook.service.ts` (Render Deploy Hook z debounce 15 s, ENV `SITE_DEPLOY_HOOK_URL`), `content.module.ts` (importuje AuthModule + EventsModule). Wpięty w `app.module.ts`.
- `render.yaml`: dodany `SITE_DEPLOY_HOOK_URL` (`sync:false`) — do skopiowania z panelu Static Site Astro (Faza 2); gdy pusty, publikacja tylko loguje.
- Sandbox: nie dało się zregenerować klienta Prisma (silnik 403), więc lokalny tsc leci na stubie `PrismaClient: any` — Prisma waliduje dopiero build Render (`prisma generate && nest build`). Dynamiczne wejścia do `data` rzutowane `as any` defensywnie (jak w events.service dla JSON). Reszta TS czysta.
- **Po pushu: Manual Deploy `icpe-api`** (nowe tabele + moduł). Test: `GET /site/pages`→`[]`, `GET /admin/content/pages` z tokenem→`[]`. Autoryzacja: ten sam `SERVICE_TOKEN`.
- Handoff zaktualizowany: sekcja §0 „Stan wdrożenia" + Faza 1 oznaczona ✅.
- Następne: Faza 2 (Astro static-site + Deploy Hook), Faza 3 (UI treści w Personal OS).

## Dziennik prac — moduł rejestracji

### Nadtytuł eventu: lista wyboru + koniec z fallbackiem
- Przyczyna „randomowego" nadtytułu: kreator eventu **w ogóle nie zapisywał** `theme.supertitle`, a `LandingHero` przy pustej wartości podstawiał `t('landing.supertitle')` = „Wyjazd formacyjny". Każdy nowy event dostawał więc tę etykietę niezależnie od charakteru.
- `LandingHero`: brak nadtytułu → nic się nie renderuje (fallback usunięty).
- `app/src/lib/supertitles.ts` — wspólna lista 10 presetów (Spotkanie wspólnoty, Rekolekcje, Obóz wakacyjny, Weekend formacyjny, Wyjazd formacyjny, Kids Ministry, Youth Ministry, Spotkanie otwarte, Fellowship, Świętowanie daru wspólnoty) + `isPresetSupertitle`.
- Select z presetami + opcja „Inny — wpisz własny…" w `EventEditForm` (per język, `editLang`) i w kreatorze `Step4Page` (jednojęzycznie, PL; `mapEditConfigToState` spłaszcza mapę do PL).

### Goście specjalni: liczba mnoga + krótki opis
- `customFields.specialGuest` rozszerzone o `plural` (bool) i `bio` (mapa językowa). Checkbox „To więcej niż jedna osoba (np. małżeństwo)" + pole „Kim są — 1–2 zdania" w `EventEditForm` (bio podpięte pod `editLang`, więc tłumaczalne) oraz w `EventWizard` (jednojęzycznie, PL — jak reszta kreatora).
- `EventContentBlocks`: etykieta z `plural`, bio pod nazwiskiem, layout przełącza się na `items-start` gdy jest opis. Przy okazji etykiety „Gość specjalny"/„Program" przeszły z hardcode'u PL na i18n (nowa sekcja `content.*` w pl/en/it) — wcześniej po przełączeniu na EN zostawały polskie.
- Backend bez zmian (customFields to wolny JSON), więc wystarczy auto-deploy frontu.

### Eventy „na zaproszenie": fix typu, blokada rejestracji, maile, panel gości
- **Bug krytyczny (potwierdzony na produkcji):** `GET /r/:slug` zwracał `{page, instance}`, gdzie `instance` to surowy rekord Prismy **bez pola `type`** (typ siedzi na `EventSeries`). Front czyta `event.type`, więc gałęzie `STANDALONE` i `INVITE` w `PublicFunnel` **nigdy się nie uruchamiały** — event na zaproszenie (`/r/covenant-day-2026`, `series.type: "INVITE"`) pokazywał zwykły lejek rejestracji. Fix: `findBySlug` dokleja `type` (z serii) i `slug` do zwracanej instancji. Dodatkowo front ma fallback `event.type ?? eventConfig?.type` (endpoint `/r/:slug/config` zwracał `type` od zawsze). **UWAGA:** po wdrożeniu eventy STANDALONE też zaczną wreszcie pokazywać ekran RSVP zamiast lejka — to zamierzone, ale warto sprawdzić istniejące standalone'y.
- **Blokada rejestracji na INVITE:** `registrations.service.create` rzuca 403 gdy `series.type === 'INVITE'` (samo ukrycie UI to nie zabezpieczenie — dało się POST-ować wprost). Na publicznej stronie baner z kłódką „To jest wydarzenie tylko dla zaproszonych gości" + wyjaśnienie (i18n: nowa sekcja `invite.*` w `pl/en/it.json`, `InviteMatchScreen` przepisany z hardcode'u PL na `t()`).
- **Eventy INVITE zniknęły z listy na stronie głównej** (`listPublicActive` pomija `type === 'INVITE'`) — prywatnego wydarzenia nie reklamujemy kafelkiem. Do rewertu jednym `if`, gdyby user chciał inaczej.
- **Maile z zaproszeniem (wcześniej ich w ogóle nie było — `createMany` tylko zapisywał do bazy):** nowy typ `INVITATION` w `notifications.service` (temat „Zaproszenie — {tytuł}", treść + przycisk „Potwierdzam udział" z linkiem `/i/:token`). `sendMail` zwraca teraz `'SENT' | 'FAILED'` zamiast `void`, żeby panel mógł pokazać, czy mail faktycznie wyszedł. Auto-wysyłka przy dodaniu gościa (`sendEmails` w body, domyślnie `true`), ręczne `POST /admin/invitations/:id/send` i zbiorcze `POST /admin/instances/:id/invitations/send` (`onlyUnsent`).
- **Prisma `Invitation`:** nowe kolumny `phone` (do WhatsAppa) i `sentAt` (kiedy poszedł mail). Wejdą przez `prisma db push` przy starcie Rendera.
- **ENV:** nowy `PUBLIC_APP_URL` (baza linków `/i/:token` w mailach; fallback `CORS_ORIGIN`, potem `https://rejestracja.icpemission.pl`) — dopisany w `render.yaml`.
- **Panel „Zaproszeni goście"** — `app/src/components/admin/events/InvitedGuestsSection.tsx`, wpięty w `EventEditForm` (sekcja widoczna tylko gdy `cfg.type === 'INVITE'`). Lista ze statusem potwierdzenia, licznik „potwierdziło N z M", kopiuj link, przycisk WhatsApp (`wa.me/<phone>?text=…`; bez numeru otwiera wybór kontaktu), wyślij/ponów mail (tooltip z datą ostatniej wysyłki), usuń, formularz dodawania (imię, nazwisko, e-mail, telefon).
- Kreator: `parseInvitees` przyjmuje teraz 3. kolumnę = telefon (`Imię Nazwisko, email, telefon`); ekran sukcesu pokazuje link z API (`inv.link`) + przycisk WhatsApp.
- **Uczciwy status wysyłki:** `sendMail` zwraca `'SENT' | 'FAILED' | 'LOGGED'`; przy `MAIL_MODE≠smtp` status to `LOGGED` (Notification.status = `LOGGED`), `sentAt` NIE jest stemplowane, a panel pokazuje wprost „Mail NIE został wysłany — serwer ma wyłączoną wysyłkę". Bez tego panel kłamałby, że zaproszenie poszło (najbardziej prawdopodobna przyczyna pierwotnego zgłoszenia „wpisałem siebie i nie dostałem zaproszenia").
- Poprawki z code review: deduplikacja w `createMany` (e-mail, a przy braku imię+nazwisko — ponowne wklejenie listy nie tworzy drugiego tokenu i drugiego maila); `baseUrl()` używa `||` zamiast `??` (pusty ENV dawał link względny); escapowanie HTML w mailu; usunięty martwy `sendInvitation` z notifications; `listPublicActive` bez N+1 (`include: { series: { select: { type: true } } }`); `matchBySlug` wymaga serii typu INVITE i **nie zwraca już `token`** (publiczny endpoint nie powinien wydawać osobistego linku komuś, kto zgadł dane); `parseInvitees` w kreatorze przyjmuje gościa bez maila (spójnie z backendem i panelem); clipboard w try/catch, `type="button"` na przyciskach.
- Handoff: `docs/11-prompt-personal-os-zaproszenia.md`.
- Weryfikacja: `tsc --noEmit` czysty w `app` i `api`. `vite build` w sandboxie nie przechodzi (esbuild ma binarkę darwin, sandbox to Linux) — build zweryfikuje Render.
- **Po pushu: Manual Deploy `icpe-api`** (nowe kolumny `Invitation.phone/sentAt`, fix `findBySlug`, blokada rejestracji). Front auto-deploy. Sprawdzić też `MAIL_MODE=smtp` na Render — przy `log` maile tylko lecą do logów.


### Edycja zgłoszeń przez admina (oba: app + Personal OS, pełna edycja z przeliczeniem)
- Backend: `PATCH /admin/registrations/:id` (registrations.controller + `adminUpdate` w service). Przyjmuje pełny skład (kontakt, uczestnicy, pokoje, opcje), PONOWNIE przelicza cenę (silnik), podmienia uczestników (transakcja: kasuje roomAssignment+participant, tworzy nowych), aktualizuje roomsJson/optionsJson/totalPrice/currency + kwotę płatności PENDING. Nie rusza statusu/metody płatności.
- Prisma: `Registration.optionsJson` + `discountCode` (nowe kolumny) — zapisywane przy create i edycji. DTO admina (`toContractRegistration`) wystawia teraz `rooms/options/discountCode/dietaryNotes` do wczytania w formularzu. `RegistrationDto` (shared) rozszerzone.
- App UI: `RegistrationEditForm.tsx` (modal) — kontakt, uczestnicy (dodaj/usuń, przypisania po ID uczestnika→indeksy przy zapisie), pokoje (typ + przypisanie osób), opcje, uwagi, żywa kwota (computePrice), walidacja (wszyscy przypisani, pojemność). Wpięte w RegistrationsScreen (przycisk „Edytuj zgłoszenie" w drawerze; pobiera pricingConfig instancji przez getEventEditConfig). api: `adminUpdateRegistration`.
- Handoff dla Personal OS: `docs/10-prompt-personal-os-edycja-zgloszen.md`.
- Weryfikacja: app+api tsc + vite build OK. Po pushu: **Manual Deploy icpe-api** (nowe kolumny optionsJson/discountCode).

### Fix funnela: blokada bez wyboru pokoju + czytelne błędy
- Bug: „API 400: ." przy submit, bo krok pokoju (step 3) przepuszczał dalej bez przypisania osób do pokoi (DTO `rooms` @ArrayNotEmpty).
- `api.ts apiFetch`: przy !res.ok czyta treść z body (NestJS `{message}`) i rzuca czytelny komunikat zamiast „API 400: {statusText pusty}".
- `PublicFunnel`: `validateRoomStep()` + `stepError` — na kroku 3 „Dalej" blokuje, gdy: brak pokoju / nieprzypisane osoby (podaje ile brakuje) / przekroczona pojemność (komunikat z `validateRoomCapacity`). Banner błędu nad paskiem ceny. Submit error z przyjaznym prefiksem „Nie udało się zapisać zgłoszenia…".
- `Step3Room`: auto-dodanie pierwszego pokoju (czytelny start) + instrukcja „Zaznacz, kto śpi w którym pokoju…".
- Weryfikacja: app tsc + vite build OK. Tylko frontend (app) → auto-deploy icpe-frontend.


### Wielojęzyczne nazwy pokoi
- Problem: nazwy pokoi to był pojedynczy string w `pricingConfig.rooms[].name`, więc zakładka języka w edytorze ich nie rozdzielała — zmiana na EN zmieniała też PL.
- `RoomTypeDef.name` → `string | Record<string,string>` w `shared/src/pricing.ts` i `api/src/_shared/pricing.ts` (lustro). Nowy helper `roomLabel(name, lng)` (fallback pl→en→it) eksportowany z shared. `validateRoomCapacity` używa `roomLabel(name)` w komunikatach.
- Backend `registrations.service.ts`: mapa `roomNames` resolvuje nazwę do PL (Personal OS), gdy name jest mapą.
- Edytor `EventEditForm`: `RoomRow.name` → mapa, input nazwy pokoju związany z `editLang` (placeholder pokazuje aktywny język), load: string→{pl}, zapis: `cleanMap(r.name)`, „Dodaj pokój" startuje `name: {}`.
- Publiczne wyświetlanie: `Step3Room` (opcje wyboru pokoju) i `SummaryScreen` przez `roomLabel(name, i18n.language)`. Dopasowanie błędów pojemności też przez `roomLabel(name)` (bo `validateRoomCapacity` buduje komunikaty z nazwą PL).
- Kreator `EventWizard`: nazwy pokoi pozostają jednojęzyczne (PL) — `mapEditConfigToState` resolvuje mapę→PL przy wczytaniu, create zapisuje `{ pl: name }`. Uwaga: edycja wielojęzycznego eventu przez kreator spłaszczyłaby nazwy pokoi do PL — właściwa ścieżka edycji to EventEditForm.
- Stan: typecheck app+api + build OK. Zmiana w `shared` + `_shared` (typ name rozszerzony, opcjonalny) → dla frontu wystarczy auto-deploy; backend Manual Deploy nie jest wymagany (zmiana tylko czyta name defensywnie).

### Fix: wyścig przy przełączaniu języka (część stringów zostawała po PL do 2. kliknięcia)
- Objaw: pierwsze kliknięcie EN zmieniało datę i opis (używają wprost `i18n.language`), ale stringi z `t()` („1 noc", „Zapisz się", „Rejestracja otwarta") zostawały po PL; drugie kliknięcie je poprawiało.
- Przyczyna: `i18n.ts` ładował `en.json`/`it.json` leniwie (async) dopiero po `languageChanged`; komponenty renderowały się zanim bundle dojechał → fallback pl, a react-i18next domyślnie nie przerysowuje na zdarzenie „dodano zasób" (bindI18nStore).
- Fix: `app/src/i18n.ts` importuje wszystkie 3 locale statycznie i rejestruje w `resources` przy init (pliki małe) — brak async, każdy `t()` zmienia się natychmiast. Usunięty backend/loadPath i `loadLocale`. Bundle frontu +~6 kB gzip (akceptowalne).
- Stan: typecheck + build OK.

### i18n dat/„noc" + waluta eventu (PLN/EUR/USD)
- Problem 1: na publicznych ekranach nazwy miesięcy i słowo „noc" były zakodowane po polsku (`toLocaleDateString('pl-PL')`, `noc/nocy`).
- `app/src/lib/utils.ts`: dodane `bcp47(lng)` (pl→pl-PL, en→en-GB, it→it-IT) oraz `formatDateRange(start,end,lng)`. Podpięte w: `LandingScreen`, `InviteMatchScreen`, `RsvpScreen`, `SummaryScreen`, `PublicHome`, `InviteConfirm` (wszystkie usunęły własne pl-PL formatery, tytuł/opis też przez `pickLang(..., i18n.language)`).
- „noc": klucze i18next z liczbą mnogą `landing.nights_one/few/many/other` w pl/en/it; użycie `t('landing.nights', { count: nights })` w LandingScreen (poprawne polskie: noc/noce/nocy).
- Problem 2 (decyzja): waluta „zł" vs „PLN" po EN → wybrano: PLN to kod ISO czytelny globalnie, „zł" polski symbol. Rozwiązane automatycznie przez `Intl.NumberFormat` currency: PLN w pl-PL = „180 zł", w en-GB = „PLN 180".
- Waluta eventu (PLN/EUR/USD): pole `currency?` w `PricingConfig` (shared + `api/src/_shared` — lustro; domyślnie PLN). Nowa funkcja `formatMoney(n, currency, lng)` w `shared/src/pricing.ts` (Intl currency, bez groszy). Założenie: organizator wpisuje kwoty w wybranej walucie — BEZ przeliczania kursów (auto-FX to osobny temat).
- Selektor waluty dodany w edytorze (`EventEditForm`, sekcja Cennik) i kreatorze (`EventWizard`, krok Cennik); zapisywany w `pricingConfig.currency`.
- Publiczne wyceny przełączone z `formatZl` na `formatMoney(..., currency, lng)`: `SummaryScreen`, `StickyPriceBar`, `SuccessScreen` (nowy prop `currency`), `Step3Room`, `Step4Options`. Admin (panel) zostaje na `formatZl`/„zł" (PL-only).
- Auto-detekcja języka przeglądarki (z poprzedniej partii) sprawia, że EN/IT gość od razu widzi daty, „noc" i walutę w swoim języku.
- Stan: typecheck app+api + build OK. Zmiana frontend + shared (bundlowane do frontu) → auto-deploy `icpe-frontend`. `_shared` w API zmienione tylko o typ `currency` (opcjonalny) — Manual Deploy niekonieczny dla tej zmiany, ale nie zaszkodzi.

### Wielojęzyczne treści eventu (tytuł/opis/nadtytuł/program) + auto-detekcja języka
- Problem: przełącznik języka tłumaczył tylko statyczne UI; treść eventu miała pola tylko po polsku (edytor zapisywał `{pl: ...}`), więc po zmianie języka zostawała po polsku.
- Bez zmian w backendzie/Prismie — `title`/`description` to już mapy JSON, a nadtytuł i program siedzą w istniejących kolumnach JSON (`theme`, `customFields`).
- `app/src/lib/api.ts`: dodany typ `LangText = string | Record<string,string>` + helper `pickLang(value, lng)` (fallback pl→en→it→pierwsza). `EventTheme.supertitle` i `EventContent.program[].item` → `LangText`. Zaktualizowany typ `EventEditConfig.theme.supertitle`.
- Rozwiązywanie języka przy renderze (wg `i18n.language`): `PublicFunnel` (`getEventTitle(title, lng)` + `useTranslation`), `LandingHero` (supertitle), `LandingScreen` (opis + program), `EventContentBlocks` (program), `InviteMatchScreen` (opis).
- Edytor `EventEditForm.tsx`: pojedyncze pola zamienione na mapy (`nameMap`/`descMap`/`superMap`, program `item` jako mapa). Dodany pasek zakładek języka („Język treści" PL/EN/IT, sticky), pokazywany tylko gdy event ma >1 język; `editLang` steruje aktywnie edytowaną wersją wszystkich tłumaczalnych pól. Godzina programu wspólna dla języków. Zapis czyści puste wersje (`cleanMap`). `title` zawsze z `pl` (wymagane przez typ `UpdateInstancePayload`).
- Auto-detekcja języka: `LanguageSwitch.tsx` przy pierwszym wczytaniu (po dociągnięciu `locales` eventu) wykrywa język przeglądarki (`navigator.languages`), i jeśli event go obsługuje — ustawia go; inaczej PL (gdy dostępny), inaczej pierwszy z listy. Ręczny wybór nie jest nadpisywany (`initialized` ref). Detekcja po IP NIE zaimplementowana (wymaga geo-API/serwera) — do rozważenia osobno.
- Zakres pól tłumaczalnych (ustalone z userem): tytuł, opis, nadtytuł, program. Gość specjalny NIE (pozostał pojedynczy string).
- Stan: typecheck + build OK. Zmiana czysto frontendowa → auto-deploy `icpe-frontend`. Uwaga: kreator nowego eventu (`EventWizard`) na razie zapisuje treść tylko po PL — zakładki językowe dodane tylko w edytorze.

### Przełącznik języka na publicznej stronie
- Problem: w ustawieniach eventu można wybrać kilka języków (`RegistrationPage.locales` zapisywane poprawnie, zwracane w `eventConfig.locales`), ale front pokazywał tylko jeden — bo brakowało przełącznika, a `i18n.ts` był zahardkodowany na `lng: 'pl'`.
- Dodany komponent `app/src/components/ui/LanguageSwitch.tsx`: kody tekstowe PL/EN/IT, pływający w rogu na lewo od ThemeToggle (`right: 58`), pokazuje tylko języki wybrane dla eventu, chowa się przy ≤1 języku, ustawia startowy język na pierwszy z listy (preferując `pl`).
- Wpięty w `PublicFunnel.tsx` obok `<ThemeToggle />` we wszystkich 3 gałęziach (STANDALONE, INVITE, główny lejek): `<LanguageSwitch locales={eventConfig?.locales} />`.
- Uwaga na przyszłość: przełącznik tłumaczy statyczne teksty UI (`locales/*.json`). Treść eventu jest wielojęzyczna tylko częściowo (opis obsługuje `{pl,en,it}`; tytuł/program to pojedyncze stringi) — pełne wielojęzyczne treści eventu to osobny, większy temat.
- Stan: typecheck + build OK. Zmiana tylko frontendowa → auto-deploy `icpe-frontend` po pushu.

### Landing: usunięcie ceny + „Zobacz program" (popup)
- Ze strony wejściowej funnela usunięta cena („cena od …"). W jej miejsce przycisk **„Zobacz program"** (ikona zegara), widoczny tylko gdy program jest wypełniony w edycji eventu. Klik → mały popup z programem godzinowym (godzina + punkt).
- Liczba wolnych miejsc pozostała po prawej.
- Pliki: `app/src/components/funnel/LandingScreen.tsx` (usunięty `computePrice`, dodane `useState showProgram`, `content.program`, modal), `app/src/pages/PublicFunnel.tsx` (przekazuje `content={eventConfig?.customFields}`).
- Program edytowany w edytorze eventu (sekcja „Program i gość specjalny").
- Stan: typecheck + build OK. **Do zrobienia po pushu:** frontend auto-deploy; backend Manual Deploy jeśli jeszcze nie po partii INVITE/customFields.

### Typ eventu „Na zaproszenie" (INVITE)
- W tworzeniu eventu: wpisywanie zapraszanych (imię, nazwisko, email). Po zapisie każdy dostaje unikalny link `/i/:token`.
- Klik w link → strona info + potwierdzenie udziału **bez podawania danych** (`app/src/pages/InviteConfirm.tsx`, route `/i/:token`).
- Wejście bez linku → formularz + match po danych (`InviteMatchScreen.tsx`, endpoint `POST /r/:slug/invite-match`), match po znormalizowanym imię+nazwisko+email.
- Zmiany w tworzeniu INVITE: liczba nocy opcjonalna („bez noclegu" → pomija Pokoje+Cennik, ale zostaje zgłaszanie alergii/wymagań żywieniowych); program (godzina + punkt); gość specjalny z portretem.
- Program + gość specjalny dodane też do **edytora eventu** (`EventEditForm.tsx`).
- Na liście eventów doszła kategoria/filtr „Na zaproszenie" (fix: `toContractInstance` nie zwracał `type` — teraz pobiera z serii).
- Backend: moduł `api/src/invitations/` (`createMany`, `list`, `remove`, `getByToken`, `confirmByToken`, `matchBySlug`).
- Komponenty: `EventContentBlocks.tsx` (render gościa + programu).

### Moduł Zakwaterowania
- Przydział numeru pokoju + opcjonalny komentarz do konkretnych gości.
- Backend: `admin.service.setAccommodation(id, {roomLabel, roomNote})`, `PATCH /admin/registrations/:id/accommodation`.
- Frontend: `AccommodationScreen.tsx`.

### Moduł Płatności
- Widok finansowy (przychód / oczekujące) + ręczne oznaczanie „opłacone".
- Frontend: `PaymentsScreen.tsx`, API `markRegistrationPaid`.

### Opcja płatności „bezpłatne" (free)
- `pricingConfig.free` → ukrywa ceny/koszty, pomija płatność. Dla eventów standalone.
- `computePrice` short-circuituje przy `free` (zwraca zera). Zsynchronizowane w `shared/src/pricing.ts` i `api/src/_shared/pricing.ts`.

### Publiczny Light/Dark toggle
- `app/src/components/ui/ThemeToggle.tsx` (pływający sun/moon), `app/src/lib/theme.ts`. Wpięty w `PublicFunnel`, `PublicHome`, ekrany invite.

### Edytowalne treści eventu
- **Opis** eventu edytowalny (był hardcode „Zapraszamy na wyjazd formacyjny…").
- **Tag/badge hero** jako dropdown: „ICPE Mission Warszawa" | „ICPE Mission Polska" | „ICPE Mission".
- **Dane przelewu** (`paymentInfo`) edytowalne per event (był hardcode IBAN).
- Stopka: dopisek zmieniony na „Rejestracja zajmuje ok. 3 minuty · prosimy o terminowe zgłoszenia".

### Lista miejsc (Places)
- Zapisywane lokalizacje: wybór z listy lub dodanie nowej.
- Backend: `api/src/places/` (`GET/POST/DELETE /admin/places`). Frontend: picker w kreatorze i edytorze eventu.

### SMTP (nodemailer)
- `notifications.service.ts`: `buildEmail` (CONFIRMATION / PAYMENT_REMINDER, polskie tematy/treści), `getTransporter()` z ENV; `MAIL_MODE=smtp` wysyła, inaczej loguje.

### Personal OS — surfacing pokoju
- Fix: API nie pokazywało zarezerwowanego pokoju. Dodane `roomSummary` (z `roomsJson` + nazwy pokoi z `pricingConfig`) mapowane w `toContractRegistration` (+ fallback `assignedRoom`), oraz `roomLabel`/`roomNote`. `listForInstance` dociąga pricingConfig do mapy nazw.
- Potwierdzone: wybór pokoju **był** zapisywany (`roomsJson`) — brakowało tylko wyświetlania.

### Panel — dodatkowe moduły
- `AttendanceScreen.tsx` (obecność/check-in, `toggleRegistrationCheckIn`), `SettingsScreen.tsx` (Light/Dark, konto, API URL). Wpięte w `AdminPanel`.
- `PublicHome.tsx` (route `/`) — strona główna z aktywnymi eventami; backend `listPublicActive()`.

---

## Powiązane dokumenty
- `docs/HANDOFF-strona-ICPE-Mission-PL.md` — architektura publicznej strony ICPE Mission PL (headless CMS na API + Astro, statystyki Umami). Nowy kierunek prac (osobny od modułu rejestracji).

---

## Do zrobienia / otwarte
- Po pushu zmian backendowych: **Manual Deploy** `icpe-api` (INVITE enum, `Invitation.dietaryNotes`, `customFields`, tabela `Place`).
- Opcjonalnie (zaproponowane, nieprzyjęte): panel zarządzania zaproszonymi w `EventEditForm` (podgląd linków + kto potwierdził).
- Faza 1 strony ICPE Mission PL: moduł `content` w `icpe-api` (patrz handoff).
