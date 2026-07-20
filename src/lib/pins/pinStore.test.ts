import { describe, expect, it } from 'vitest';
import {
  clearAllPins,
  clearPinScope,
  getStalePins,
  PIN_LIMITS,
  removePin,
  syncPinScope,
  upsertPin,
} from './pinStore';
import type { PinStoreV1, PrScope } from './types';

const scope: PrScope = {
  owner: 'OpenAI',
  repository: 'Codex',
  pullNumber: 42,
};
const now = '2026-07-20T00:00:00.000Z';
const emptyStore = (): PinStoreV1 => ({ version: 1, scopes: {} });

const sync = (store: PinStoreV1, paths = ['src/a.ts']): PinStoreV1 =>
  syncPinScope(
    store,
    { scope, currentFingerprint: `fp-${paths.join('-')}`, currentPaths: paths },
    now,
  );

describe('pin store mutations', () => {
  it('adds and edits a normalized pin while preserving createdAt', () => {
    const initialized = sync(emptyStore());
    const added = upsertPin(
      initialized,
      {
        scope,
        path: '/src//a.ts',
        reason: 'question',
        note: '  why?  ',
        currentFingerprint: 'fp-src/a.ts',
      },
      now,
    );
    const edited = upsertPin(
      added,
      {
        scope,
        path: 'src/a.ts',
        reason: 'risk',
        note: 'security boundary',
        currentFingerprint: 'fp-src/a.ts',
      },
      '2026-07-21T00:00:00.000Z',
    );
    const pin = edited.scopes['openai/codex#42'].pins['src/a.ts'];

    expect(pin).toMatchObject({
      path: 'src/a.ts',
      reason: 'risk',
      note: 'security boundary',
      createdAt: now,
      updatedAt: '2026-07-21T00:00:00.000Z',
    });
  });

  it('accepts exactly 200 Unicode code points and rejects 201', () => {
    const initialized = sync(emptyStore());
    const request = {
      scope,
      path: 'src/a.ts',
      reason: 'custom' as const,
      currentFingerprint: 'fp-src/a.ts',
    };

    expect(() =>
      upsertPin(initialized, { ...request, note: '📌'.repeat(200) }, now),
    ).not.toThrow();
    expect(() =>
      upsertPin(initialized, { ...request, note: '📌'.repeat(201) }, now),
    ).toThrow(/200/u);
  });

  it('keeps pins and records both fingerprints when the PR changes', () => {
    const pinned = upsertPin(
      sync(emptyStore()),
      {
        scope,
        path: 'src/a.ts',
        reason: 'revisit',
        note: '',
        currentFingerprint: 'fp-src/a.ts',
      },
      now,
    );
    const changed = syncPinScope(
      pinned,
      {
        scope,
        currentFingerprint: 'changed-fingerprint',
        currentPaths: ['src/b.ts'],
      },
      '2026-07-21T00:00:00.000Z',
    );
    const state = changed.scopes['openai/codex#42'];

    expect(state.previousFingerprint).toBe('fp-src/a.ts');
    expect(state.observedFingerprint).toBe('changed-fingerprint');
    expect(state.pins['src/a.ts']).toBeDefined();
    expect(getStalePins(state, ['src/b.ts']).map((pin) => pin.path)).toEqual([
      'src/a.ts',
    ]);
  });

  it('does not report a change after syncing the same fingerprint again', () => {
    const first = sync(emptyStore());
    const second = syncPinScope(
      first,
      {
        scope,
        currentFingerprint: 'fp-src/a.ts',
        currentPaths: ['src/a.ts'],
      },
      now,
    );

    expect(
      second.scopes['openai/codex#42'].previousFingerprint,
    ).toBeUndefined();
  });

  it('removes pins and supports scope or global clearing', () => {
    const pinned = upsertPin(
      sync(emptyStore()),
      {
        scope,
        path: 'src/a.ts',
        reason: 'test',
        note: '',
        currentFingerprint: 'fp-src/a.ts',
      },
      now,
    );

    expect(removePin(pinned, { scope, path: 'src/a.ts' }).scopes).toEqual({});
    expect(clearPinScope(pinned, { scope }).scopes).toEqual({});
    expect(clearAllPins(pinned)).toEqual(emptyStore());
  });

  it('enforces the per-scope pin limit without evicting data', () => {
    let store = sync(emptyStore(), []);
    for (let index = 0; index < PIN_LIMITS.pinsPerScope; index += 1) {
      store = upsertPin(
        store,
        {
          scope,
          path: `src/${index}.ts`,
          reason: 'revisit',
          note: '',
          currentFingerprint: 'fp',
        },
        now,
      );
    }

    expect(() =>
      upsertPin(
        store,
        {
          scope,
          path: 'src/overflow.ts',
          reason: 'risk',
          note: '',
          currentFingerprint: 'fp',
        },
        now,
      ),
    ).toThrow(/200/u);
    expect(Object.keys(store.scopes['openai/codex#42'].pins)).toHaveLength(200);
  });

  it('enforces the 100-scope limit', () => {
    let store = emptyStore();
    for (let pullNumber = 1; pullNumber <= PIN_LIMITS.scopes; pullNumber += 1) {
      store = syncPinScope(
        store,
        {
          scope: { ...scope, pullNumber },
          currentFingerprint: `fp-${pullNumber}`,
          currentPaths: [],
        },
        now,
      );
    }

    expect(() =>
      syncPinScope(
        store,
        {
          scope: { ...scope, pullNumber: 101 },
          currentFingerprint: 'overflow',
          currentPaths: [],
        },
        now,
      ),
    ).toThrow(/100/u);
  });
});
