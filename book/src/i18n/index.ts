import type { Lang } from '../config';
import type { Dict } from './types';
import en from './en';
import pl from './pl';
import it from './it';
import es from './es';
import ko from './ko';

export const DICTS: Record<Lang, Dict> = { en, pl, it, es, ko };
export type { Dict };
