import { describe, expect, it } from 'vitest';
import { createRevisionFingerprint } from './fingerprint';

describe('revision fingerprint', () => {
  it('is independent of DOM order', async () => {
    const first = await createRevisionFingerprint(
      [
        { path: 'src/b.ts', diffAnchor: '#diff-b' },
        { path: 'src/a.ts', diffAnchor: '#diff-a' },
      ],
      'head-a',
    );
    const second = await createRevisionFingerprint(
      [
        { path: 'src/a.ts', diffAnchor: '#diff-a' },
        { path: 'src/b.ts', diffAnchor: '#diff-b' },
      ],
      'head-a',
    );

    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/u);
  });

  it('changes when a path or diff anchor changes', async () => {
    const baseline = await createRevisionFingerprint(
      [{ path: 'src/a.ts', diffAnchor: '#diff-a' }],
      'head-a',
    );

    await expect(
      createRevisionFingerprint(
        [{ path: 'src/a.ts', diffAnchor: '#diff-new' }],
        'head-a',
      ),
    ).resolves.not.toBe(baseline);
  });

  it('changes when the PR head changes without changing the file set', async () => {
    const items = [{ path: 'src/a.ts', diffAnchor: '#diff-a' }];

    const first = await createRevisionFingerprint(items, 'head-a');
    const second = await createRevisionFingerprint(items, 'head-b');

    expect(second).not.toBe(first);
  });
});
