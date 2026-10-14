import type { Lang } from '../config';
import type { Dict } from './types';
import en from './en';
import pl from './pl';
import it from './it';
import es from './es';

export const DICTS: Record<Lang, Dict> = { en, pl, it, es };
export type { Dict };
