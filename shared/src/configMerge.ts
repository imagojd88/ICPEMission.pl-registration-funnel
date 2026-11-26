/**
 * Bezpieczny zapis konfiguracji eventu z panelu.
 *
 * 1) `mergePricingConfig` — formularz („Edytuj event”, kreator w trybie edycji) NIE składa cennika
 *    od zera: nakłada swoje pola na ORYGINALNIE wczytany obiekt. Klucze, których ta wersja formularza
 *    nie obsługuje (na poziomie cennika, pokoju, progu wiekowego, poziomu cen, dodatku, opcji),
 *    zostają. Pola, które formularz obsługuje, a admin je usunął — znikają.
 * 2) `PANEL_CONFIG_LEVEL` — „poziom” formularza cennika. Panel odsyła go przy zapisie konfiguracji,
 *    a API odrzuca zapis z panelu bez poziomu albo z niższym (stara karta przeglądarki).
 *    PODNIEŚ o 1 przy każdej zmianie, po której starszy formularz zgubiłby dane cennika.
 * 3) `evaluateConfigWrite` — reguła serwera (czysta, testowana).
 *
 * Plik bez importów wykonywalnych (testy `node --test` na samych .ts).
 */

/**
 * Poziom formularza konfiguracji eventu.
 *  1 — do 25.11.2026 (bez znacznika; karty sprzed tej zmiany nie wysyłają nic)
 *  2 — 26.11.2026: scalanie z oryginałem, dodatki z limitem, historia konfiguracji
 */
export const PANEL_CONFIG_LEVEL = 2;
/** Najniższy poziom panelu, z którego API przyjmuje zapis konfiguracji eventu. */
export const MIN_PANEL_CONFIG_LEVEL = 2;

export interface ManagedPricingKeys {
  top: string[];
  room: string[];
  bracket: string[];
  tier: string[];
  addon: string[];
  options: string[];
}

/** Pola cennika obsługiwane przez formularz „Edytuj event” (poziom 2). */
export const EDIT_FORM_MANAGED: ManagedPricingKeys = {
  top: [
    'free', 'currency', 'leaderDepositPct', 'formationFee', 'mealsFee', 'nights', 'accommodationOptional',
    'overnightMealsFee', 'childBrackets', 'rooms', 'options', 'discountCodes', 'donationEnabled',
    'paymentPlan', 'priceTiers', 'baseTierName', 'addons',
  ],
  room: ['id', 'name', 'cap', 'perPerson', 'priceUnit', 'model', 'tag', 'stock', 'reserved', 'depositPct'],
  bracket: ['ltAge', 'multiplier', 'eventMultiplier', 'mealsMultiplier', 'mealsDiscountAmount'],
  tier: ['id', 'name', 'from', 'mealsFee', 'formationFee', 'rooms'],
  addon: ['id', 'name', 'desc', 'limit', 'maxPerRegistration', 'price', 'childUnderAge'],
  options: ['transport', 'bedding'],
};

/**
 * Kreator w trybie edycji: poziomy cen, nazwa pierwszego poziomu i dodatki tylko przenosi
 * (nie edytuje ich), więc nie wolno mu ich usuwać — zostają z oryginału.
 */
export const WIZARD_MANAGED: ManagedPricingKeys = {
  ...EDIT_FORM_MANAGED,
  top: EDIT_FORM_MANAGED.top.filter((k) => !['priceTiers', 'baseTierName', 'addons'].includes(k)),
};

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * Nakłada `built` na `original`: klucze spoza `managed` zostają z oryginału, obsługiwane — tylko z `built`.
 * Do obiektów płaskich (np. dane przelewu, motyw, `customFields` strony).
 */
export function overlayKnown<T extends object>(original: unknown, built: T, managed: string[]): T {
  return overlay(original, built as unknown as Obj, managed) as unknown as T;
}

function overlay(original: unknown, built: Obj, managed: string[]): Obj {
  const out: Obj = {};
  if (isObj(original)) {
    const m = new Set(managed);
    for (const [k, v] of Object.entries(original)) if (!m.has(k) && !(k in built)) out[k] = v;
  }
  return { ...out, ...built };
}

function overlayList(original: unknown, built: unknown, keyOf: (o: Obj) => string, managed: string[]): unknown {
  if (!Array.isArray(built)) return built;
  const byKey = new Map<string, Obj>();
  if (Array.isArray(original)) {
    for (const o of original) if (isObj(o)) { const k = keyOf(o); if (k && !byKey.has(k)) byKey.set(k, o); }
  }
  return built.map((b) => (isObj(b) ? overlay(byKey.get(keyOf(b)), b, managed) : b));
}

/**
 * Cennik do zapisu = oryginał z nałożonymi polami formularza.
 *  - poziom cennika: nieznane klucze zostają; znane brane wyłącznie z `built` (brak = usunięte),
 *  - pokoje (po `id`), progi wiekowe (po `ltAge`), poziomy cen (po `id`), dodatki (po `id`):
 *    element usunięty w formularzu znika; w elementach pozostałych nieznane klucze zostają,
 *  - `options`: nieznane klucze zostają.
 */
export function mergePricingConfig<T extends object>(original: unknown, built: T, managed: ManagedPricingKeys = EDIT_FORM_MANAGED): T {
  const b = built as unknown as Obj;
  const o = isObj(original) ? original : {};
  const out = overlay(o, b, managed.top);
  const id = (x: Obj) => (x.id === undefined || x.id === null ? '' : String(x.id));
  if ('rooms' in b) out.rooms = overlayList(o.rooms, b.rooms, id, managed.room);
  if ('childBrackets' in b) out.childBrackets = overlayList(o.childBrackets, b.childBrackets, (x) => String(x.ltAge ?? ''), managed.bracket);
  if ('priceTiers' in b) out.priceTiers = overlayList(o.priceTiers, b.priceTiers, id, managed.tier);
  if ('addons' in b) out.addons = overlayList(o.addons, b.addons, id, managed.addon);
  if (isObj(b.options)) out.options = overlay(o.options, b.options, managed.options);
  return out as unknown as T;
}

// ── Reguła serwera ─────────────────────────────────────────────────────────────────────────

export interface ConfigWriteMeta {
  /** wersja buildu panelu (informacyjnie, do historii) */
  clientVersion?: string;
  /** poziom formularza (`PANEL_CONFIG_LEVEL` z chwili buildu) */
  configLevel?: number;
  /** `configRev` odczytane przy wczytaniu formularza */
  configRev?: number;
}

/** Odczytuje `_client` z ciała żądania (nic nie zakłada o kształcie). */
export function readConfigWriteMeta(raw: unknown): ConfigWriteMeta {
  if (!isObj(raw)) return {};
  const out: ConfigWriteMeta = {};
  if (typeof raw.version === 'string' && raw.version) out.clientVersion = raw.version.slice(0, 80);
  const lvl = Number(raw.configLevel);
  if (Number.isInteger(lvl) && lvl > 0) out.configLevel = lvl;
  const rev = Number(raw.configRev);
  if (raw.configRev !== undefined && raw.configRev !== null && Number.isInteger(rev) && rev >= 0) out.configRev = rev;
  return out;
}

export type ConfigWriteVerdict = { ok: true } | { ok: false; code: 'STALE_PANEL' | 'CONFLICT'; message: string };

export const STALE_PANEL_MESSAGE =
  'Ta karta panelu działa w starej wersji i mogłaby skasować nowsze ustawienia cennika. NIC nie zostało zapisane. Odśwież stronę (Ctrl+R / Cmd+R) i wprowadź zmiany ponownie.';
export const CONFIG_CONFLICT_MESSAGE =
  'Ustawienia tego eventu zostały w międzyczasie zmienione (inna karta lub inna osoba). NIC nie zostało zapisane. Odśwież stronę, sprawdź aktualne ustawienia i wprowadź zmiany ponownie.';

/**
 * Czy przyjąć zapis konfiguracji eventu.
 *  - Reguła dotyczy tylko żądań, które ZMIENIAJĄ cennik (`touchesPricing`), wysłanych tokenem
 *    zalogowanego admina panelu (`realm === 'admin'`). Token serwisowy (Personal OS, integracje)
 *    nie jest sprawdzany — działa jak dotąd.
 *  - Panel bez `configLevel` albo z poziomem niższym niż `MIN_PANEL_CONFIG_LEVEL` → STALE_PANEL.
 *  - Podany `configRev` inny niż aktualny w bazie → CONFLICT (dwie karty / dwie osoby).
 */
export function evaluateConfigWrite(input: {
  realm: string | null | undefined;
  touchesPricing: boolean;
  meta: ConfigWriteMeta;
  currentRev: number;
  minLevel?: number;
}): ConfigWriteVerdict {
  if (!input.touchesPricing || input.realm !== 'admin') return { ok: true };
  const min = input.minLevel ?? MIN_PANEL_CONFIG_LEVEL;
  if (!input.meta.configLevel || input.meta.configLevel < min) return { ok: false, code: 'STALE_PANEL', message: STALE_PANEL_MESSAGE };
  if (input.meta.configRev !== undefined && input.meta.configRev !== input.currentRev) return { ok: false, code: 'CONFLICT', message: CONFIG_CONFLICT_MESSAGE };
  return { ok: true };
}

/** Krótki opis migawki cennika do listy „Historia zmian cennika”. */
export function pricingSnapshotSummary(pc: unknown): string {
  if (!isObj(pc)) return 'brak cennika';
  const n = (v: unknown) => (Array.isArray(v) ? v.length : 0);
  const parts = [
    `formacja ${Number(pc.formationFee) || 0}`,
    `wyżywienie ${Number(pc.mealsFee) || 0}`,
    `pokoje: ${n(pc.rooms)}`,
    `poziomy cen: ${n(pc.priceTiers)}`,
    `progi wiekowe: ${n(pc.childBrackets)}`,
    `harmonogram: ${isObj(pc.paymentPlan) ? 'tak' : 'nie'}`,
    `dodatki: ${n(pc.addons)}`,
    `kody: ${isObj(pc.discountCodes) ? Object.keys(pc.discountCodes).length : 0}`,
  ];
  return parts.join(' · ');
}
