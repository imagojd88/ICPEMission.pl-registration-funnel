# ICPE Mission — Frontend (`app`)

React + TypeScript + Vite + Tailwind CSS. UI odtworzone 1:1 z handoffu Claude Design (tokeny light/dark, Newsreader + Plus Jakarta Sans, lucide-react). Wielojęzyczność PL/EN/IT (`react-i18next`).

## Uruchomienie
```bash
npm install          # lub `npm install` w root (workspaces)
npm run dev          # http://localhost:5173
npm run build        # produkcyjny build (tsc && vite build)
```
Aplikacja działa **bez backendu** — `src/lib/api.ts` ma fallback do danych mock (z prototypu). Aby podłączyć API, ustaw `VITE_API_URL` (domyślnie `http://localhost:3000`).

## Trasy
- `/r/:slug` — publiczny lejek rejestracji (mobile-first, ramka 452px).
- `/admin/*` — panel administracyjny (desktop-first).

## Struktura
```
src/
├── pages/            PublicFunnel.tsx, AdminPanel.tsx (lazy)
├── components/
│   ├── funnel/       Landing (Hero A), stepper (kroki 0–4), wybór płatności,
│   │                 podsumowanie (rozliczenie + kalendarz + kopiowanie przelewu), sukces
│   ├── admin/        sidebar, dashboard, eventy + kreator (live preview), zgłoszenia + drawer
│   └── ui/           Button, Input, Card, Badge, Skeleton… (shadcn-style)
├── lib/              api.ts (klient + mocki), theme.ts, utils.ts
├── locales/          pl/en/it
├── i18n.ts
└── index.css         design tokeny (:root + .dark)
```

## Wycena
Cena na żywo liczona przez `computePrice()` z `@icpe/shared` (ten sam kod, który backend używa jako ceny wiążącej). Kalendarz (.ics / Google) przez `@icpe/shared/calendar`.

## Świadome uproszczenia
- Moduły admina Zakwaterowanie / Płatności / Obecność / Ustawienia są jako EmptyState „w przygotowaniu" (zakres post-MVP wg briefu).
- Przełącznik motywu i języka jest dyskretny (dev); pasek „chrome" recenzenta z prototypu nie został wdrożony zgodnie z handoffem.
