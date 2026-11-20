/**
 * Postęp kursanta i tryb sekwencyjny („incremental") — logika czysta (bez bazy), wspólna dla
 * panelu kursanta (MemberService) i raportu aktywności (CourseTrackingService).
 *
 * Zasady:
 *  - Materiał jest ukończony, gdy: kursant kliknął „Oznaczam jako ukończone" (MANUAL), obejrzał ≥90% filmu
 *    (VideoProgress.completedAt) albo otworzył/pobrał PDF.
 *  - Moduł jest ukończony, gdy ma co najmniej jeden widoczny materiał i wszystkie widoczne materiały są ukończone.
 *    Film „wkrótce dostępny" (jeszcze się wysyła) też trzeba ukończyć — blokuje do czasu publikacji
 *    (admin może go ukryć okiem w panelu, wtedy przestaje się liczyć).
 *  - W trybie sekwencyjnym pierwszy moduł jest otwarty, każdy następny dopiero po ukończeniu poprzedniego.
 *    Materiały bez modułu są zawsze dostępne i nie wchodzą do sekwencji.
 */

export interface ProgressModule {
  id: string;
  order: number;
  createdAt?: Date | string;
}

export interface ProgressItem {
  id: string;
  moduleId: string | null;
}

export interface ModuleState {
  id: string;
  /** Liczba widocznych materiałów w module. */
  total: number;
  /** Ile z nich ukończono. */
  doneCount: number;
  done: boolean;
  locked: boolean;
}

export function sortModules<M extends ProgressModule>(modules: M[]): M[] {
  return [...modules].sort(
    (a, b) => a.order - b.order || new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime(),
  );
}

/**
 * Stan modułów dla jednego kursanta.
 * @param items  materiały WIDOCZNE dla kursanta (opublikowane, po dacie publikacji)
 * @param done   identyfikatory ukończonych materiałów
 */
export function moduleStates(
  modules: ProgressModule[],
  items: ProgressItem[],
  done: Set<string>,
  sequential: boolean,
): ModuleState[] {
  const out: ModuleState[] = [];
  let prevOpenAndDone = true;
  for (const m of sortModules(modules)) {
    const mine = items.filter((i) => i.moduleId === m.id);
    const doneCount = mine.filter((i) => done.has(i.id)).length;
    const isDone = mine.length > 0 && doneCount === mine.length;
    const locked: boolean = sequential ? !prevOpenAndDone : false;
    out.push({ id: m.id, total: mine.length, doneCount, done: isDone, locked });
    prevOpenAndDone = !locked && isDone;
  }
  return out;
}

/** Czy materiał jest zablokowany (leży w zablokowanym module). */
export function isItemLocked(item: ProgressItem, states: ModuleState[]): boolean {
  if (!item.moduleId) return false;
  const s = states.find((x) => x.id === item.moduleId);
  return !!s?.locked;
}

/** Zbiór ukończonych materiałów z trzech źródeł (wpisy ukończenia, postęp filmów, otwarcia PDF). */
export function completedSet(
  completions: { itemId: string }[],
  progress: { itemId: string; completedAt: Date | null }[],
  pdfEvents: { itemId: string | null }[],
): Set<string> {
  const s = new Set<string>();
  for (const c of completions) s.add(c.itemId);
  for (const p of progress) if (p.completedAt) s.add(p.itemId);
  for (const e of pdfEvents) if (e.itemId) s.add(e.itemId);
  return s;
}
