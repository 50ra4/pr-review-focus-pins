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

  it('keeps the same file path isolated between pull requests', () => {
    const otherScope = { ...scope, pullNumber: 43 };
    const first = upsertPin(
      sync(emptyStore()),
      {
        scope,
        path: 'src/shared.ts',
        reason: 'question',
        note: 'PR 42',
        currentFingerprint: 'fp-42',
      },
      now,
    );
    const second = upsertPin(
      syncPinScope(
        first,
        {
          scope: otherScope,
          currentFingerprint: 'fp-43',
          currentPaths: ['src/shared.ts'],
        },
        now,
      ),
      {
        scope: otherScope,
        path: 'src/shared.ts',
        reason: 'risk',
        note: 'PR 43',
        currentFingerprint: 'fp-43',
      },
      now,
    );

    expect(second.scopes['openai/codex#42'].pins['src/shared.ts'].note).toBe(
      'PR 42',
    );
    expect(second.scopes['openai/codex#43'].pins['src/shared.ts'].note).toBe(
      'PR 43',
    );
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

  it('enforces the 500-pin total limit without evicting another scope', () => {
    let store = emptyStore();
    for (let scopeIndex = 1; scopeIndex <= 3; scopeIndex += 1) {
      const currentScope = { ...scope, pullNumber: scopeIndex };
      store = syncPinScope(
        store,
        {
          scope: currentScope,
          currentFingerprint: `fp-${scopeIndex}`,
          currentPaths: [],
        },
        now,
      );
      const pinsToAdd = scopeIndex < 3 ? 200 : 100;
      for (let pinIndex = 0; pinIndex < pinsToAdd; pinIndex += 1) {
        store = upsertPin(
          store,
          {
            scope: currentScope,
            path: `scope-${scopeIndex}/${pinIndex}.ts`,
            reason: 'revisit',
            note: '',
            currentFingerprint: `fp-${scopeIndex}`,
          },
          now,
        );
      }
    }

    expect(() =>
      upsertPin(
        store,
        {
          scope: { ...scope, pullNumber: 3 },
          path: 'scope-3/overflow.ts',
          reason: 'risk',
          note: '',
          currentFingerprint: 'fp-3',
        },
        now,
      ),
    ).toThrow(/500/u);
    expect(
      Object.values(store.scopes).reduce(
        (count, state) => count + Object.keys(state.pins).length,
        0,
      ),
    ).toBe(500);
  });
});
