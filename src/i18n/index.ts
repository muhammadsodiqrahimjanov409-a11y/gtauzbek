import type { Language } from '../types/game';
import { uz, type TranslationDictionary } from './uz';
import { en } from './en';
import { ru } from './ru';

const dictionaries: Record<Language, TranslationDictionary> = {
  uz,
  en,
  ru,
};

export function getTranslations(lang: Language): TranslationDictionary {
  return dictionaries[lang] ?? uz;
}

export function resolveNestedKey(dict: TranslationDictionary, path: string): string {
  const parts = path.split('.');
  let current: unknown = dict;
  for (const part of parts) {
    if (current && typeof current === 'object' && part in (current as Record<string, unknown>)) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return path;
    }
  }
  return typeof current === 'string' ? current : path;
}

export type { TranslationDictionary };
