# Session Notes — ICPEMission.pl

> Dziennik prac projektu. **Zasada: każda sesja dopisuje tu swoje zmiany** (co zrobione, gdzie, dlaczego, stan wdrożenia). Najnowsze wpisy na górze sekcji.

---

## Stack i wdrożenie (skrót)

- **Monorepo** npm workspaces: `app/` (React 18 + Vite + TS + Tailwind), `api/` (NestJS 10 + Prisma + PostgreSQL), `shared/` (kontrakt + silnik wyceny).
- **Vendored shared:** `api/` importuje z `'../shared'` = `api/src/_shared/` — musi być lustrem `shared/src/` (silnik pricingu).
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
- `RegistrationPage.customFields` (JSON): `{ program: [{time,item}], specialGuest: {name, photoUrl} }`.
- `pricingConfig` (JSON): dodane `free?: boolean` (event bezpłatny).
- `Registration`: `checkedInAt`, `roomLabel`, `roomNote`, `roomsJson`.
- `Invitation` (model): `token @unique`, `confirmedAt`, `dietaryNotes`.
- `Place` (model): zapisywane lokalizacje `{ id, label, createdAt }`.

---

## Dziennik prac — strona ICPE Mission PL (CMS)

### Poprawki treści landingu (tagi mapy, zdania)
- Tagi wspólnot na mapie: usunięte „Oddział · …", „Ten dom · hub", „Serce wspólnoty", „Fraternia", „Oddział · od 1996" → zostaje sam kontynent (Europa/Azja/Afryka/Oceania/Ameryka Płn./Ameryka Płd. + EN). Zmienione w DWÓCH miejscach: `WorldMap.astro` (dane bazowe/fallback) i `api/src/content/community-seed.ts` (seed CMS) — żeby po wdrożeniu Community CMS nie nadpisał nowych wartości starymi.
- Zdanie nad mapą → „ICPE Warszawa to jedna z 23 wspólnot Instytutu Ewangelizacji Świata – ICPE Mission na świecie. Zobacz, gdzie jeszcze jesteśmy obecni." (+ EN).
- Zdanie w CTA → „Napisz do wspólnoty warszawskiej lub odwiedź nas na jednym z naszych wydarzeń." (+ EN).
- Weryfikacja: astro build + check = 0 błędów, api tsc OK.
- „Napisz do nas" → **mailto** `warszawa@icpemission.pl` (wybór usera). Antyspam: adres jako base64 w `data-mail`, `mailto:` (z tematem „Kontakt — ICPE Mission Warszawa") składany w JS przy załadowaniu → w źródle HTML brak wzorca „x@y" (zweryfikowane: 0 wystąpień plaintextu). Podpięte: przycisk w nawigacji, przycisk w banerze CTA, oraz zakodowany link w stopce (JS pokazuje adres jako tekst). Fallback bez JS: `href="#kontakt"` (scroll do stopki). Klasa `.js-mail` + skrypt w index.astro.

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
