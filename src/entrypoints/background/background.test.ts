import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installChromeFake } from '../../lib/testing/chromeFake';
import { sendMessage } from '../../lib/messaging/messages';

describe('background pin mutation queue', () => {
  beforeEach(async () => {
    installChromeFake();
    vi.resetModules();
    await import('./background');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('does not lose concurrent updates from separate PR tabs', async () => {
    const scope = { owner: 'OpenAI', repository: 'Codex', pullNumber: 42 };
    await sendMessage('syncPinScope', {
      scope,
      currentFingerprint: 'fingerprint',
      currentPaths: ['src/a.ts', 'src/b.ts'],
    });

    const [first, second] = await Promise.all([
      sendMessage('upsertPin', {
        scope,
        path: 'src/a.ts',
        reason: 'question',
        note: '',
        currentFingerprint: 'fingerprint',
      }),
      sendMessage('upsertPin', {
        scope,
        path: 'src/b.ts',
        reason: 'risk',
        note: 'review boundary',
        currentFingerprint: 'fingerprint',
      }),
    ]);

    expect(Object.keys(first.scopes['openai/codex#42'].pins)).toHaveLength(1);
    expect(Object.keys(second.scopes['openai/codex#42'].pins)).toHaveLength(2);
  });

  it('continues processing after a rejected mutation', async () => {
    const scope = { owner: 'OpenAI', repository: 'Codex', pullNumber: 42 };

    await expect(
      sendMessage('upsertPin', {
        scope,
        path: 'src/a.ts',
        reason: 'risk',
        note: 'x'.repeat(201),
        currentFingerprint: 'fingerprint',
      }),
    ).rejects.toThrow();

    await expect(
      sendMessage('syncPinScope', {
        scope,
        currentFingerprint: 'fingerprint',
        currentPaths: ['src/a.ts'],
      }),
    ).resolves.toMatchObject({ version: 1 });
  });
});
