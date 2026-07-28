import { describe, expect, it } from 'vitest';
import {
  createFileTreeSignature,
  createRevisionFingerprint,
} from './fingerprint';

describe('revision fingerprint', () => {
  it('is deterministic for one PR head revision', async () => {
    const first = await createRevisionFingerprint('head-a');
    const second = await createRevisionFingerprint('head-a');

    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/u);
  });

  it('changes when the PR head changes', async () => {
    const first = await createRevisionFingerprint('head-a');
    const second = await createRevisionFingerprint('head-b');

    expect(second).not.toBe(first);
  });

  it('creates a stability signature from the rendered paths', () => {
    const first = createFileTreeSignature(
      [{ path: 'src/a.ts', diffAnchor: '#diff-a' }],
      'head-a',
    );
    const second = createFileTreeSignature(
      [{ path: 'src/b.ts', diffAnchor: '#diff-b' }],
      'head-a',
    );

    expect(second).not.toBe(first);
  });
});
