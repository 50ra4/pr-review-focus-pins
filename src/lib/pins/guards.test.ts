import { describe, expect, it } from 'vitest';
import {
  countCodePoints,
  createScopeKey,
  isPinReason,
  isPinStoreV1,
  normalizeFilePath,
} from './guards';

describe('pin guards and normalization', () => {
  it.each([
    ['revisit', true],
    ['question', true],
    ['test', true],
    ['risk', true],
    ['custom', true],
    ['other', false],
    ['', false],
  ])('validates reason %j', (reason, expected) => {
    expect(isPinReason(reason)).toBe(expected);
  });

  it('normalizes only separators while preserving path case', () => {
    expect(normalizeFilePath('///Src//Feature/Button.tsx')).toBe(
      'Src/Feature/Button.tsx',
    );
  });

  it('normalizes repository identity in the scope key', () => {
    expect(
      createScopeKey({ owner: 'OpenAI', repository: 'Codex', pullNumber: 42 }),
    ).toBe('openai/codex#42');
  });

  it('counts Unicode code points instead of UTF-16 code units', () => {
    expect(countCodePoints('a'.repeat(199) + '📌')).toBe(200);
  });

  it('rejects an incompatible stored schema version without deleting it', () => {
    expect(isPinStoreV1({ version: 2, scopes: {} })).toBe(false);
    expect(isPinStoreV1({ version: 1, scopes: {} })).toBe(true);
  });
});
