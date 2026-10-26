import { describe, test, expect } from 'vitest';
import { translations } from './translations';

describe('translations', () => {
  const enKeys = Object.keys(translations.en).sort();
  const idKeys = Object.keys(translations.id).sort();

  test('EN and ID dictionaries define exactly the same keys', () => {
    const missingInId = enKeys.filter((k) => !(k in translations.id));
    const missingInEn = idKeys.filter((k) => !(k in translations.en));

    expect(missingInId, `keys missing in ID: ${missingInId.join(', ')}`).toEqual([]);
    expect(missingInEn, `keys missing in EN: ${missingInEn.join(', ')}`).toEqual([]);
  });

  test('no translation value is empty or whitespace-only', () => {
    for (const [lang, dict] of Object.entries(translations)) {
      for (const [key, value] of Object.entries(dict)) {
        expect(typeof value === 'string' && value.trim().length > 0, `${lang}:${key} has an empty value`).toBe(true);
      }
    }
  });

  test('translation keys are unique after normalization (no accidental dupes)', () => {
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const key of enKeys) {
      if (seen.has(key)) dupes.push(key);
      seen.add(key);
    }
    expect(dupes).toEqual([]);
  });
});
