/**
 * Diety do wyboru w formularzu zapisu — włączane per event przez admina
 * (`customFields.diets`: lista kluczy; domyślnie pusta = brak wyboru diet).
 * Katalog, etykiety i zliczanie są w `shared/src/diets.ts` (wspólne z API i testami);
 * ten plik zostaje dla dotychczasowych importów.
 */
export { DIETS, enabledDiets, dietLabel, participantDietaryText, parseDietary, displayDietary } from '@icpe/shared'
export type { DietOption } from '@icpe/shared'
