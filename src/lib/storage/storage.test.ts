import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installChromeFake, type ChromeFake } from '../testing/chromeFake';
import {
  getStorageValue,
  onStorageValueChanged,
  removeStorageValue,
  setStorageValue,
} from './storage';

let chromeFake: ChromeFake;

beforeEach(() => {
  chromeFake = installChromeFake();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('typed storage', () => {
  it('returns the schema default value when storage has no value', async () => {
    await expect(getStorageValue('pinStore')).resolves.toEqual({
      version: 1,
      scopes: {},
    });
  });

  it('sets and gets a typed value', async () => {
    const store = { version: 1 as const, scopes: {} };
    await setStorageValue('pinStore', store);

    await expect(getStorageValue('pinStore')).resolves.toEqual(store);
  });

  it('removes a value and falls back to the schema default value', async () => {
    await setStorageValue('pinStore', { version: 1, scopes: {} });
    await removeStorageValue('pinStore');

    await expect(getStorageValue('pinStore')).resolves.toEqual({
      version: 1,
      scopes: {},
    });
  });

  it('subscribes to typed storage changes for a key', async () => {
    const listener = vi.fn();
    const unsubscribe = onStorageValueChanged('pinStore', listener);

    const previous = { version: 1 as const, scopes: {} };
    await setStorageValue('pinStore', previous);
    listener.mockClear();
    const next = {
      version: 1 as const,
      scopes: {
        'openai/codex#42': {
          scope: { owner: 'OpenAI', repository: 'Codex', pullNumber: 42 },
          observedFingerprint: 'fingerprint',
          lastSeenAt: '2026-07-20T00:00:00.000Z',
          pins: {},
        },
      },
    };
    await setStorageValue('pinStore', next);

    expect(listener).toHaveBeenCalledWith(next, previous);

    unsubscribe();
    expect(
      chromeFake.chrome.storage.onChanged.removeListener,
    ).toHaveBeenCalledTimes(1);
  });
});
