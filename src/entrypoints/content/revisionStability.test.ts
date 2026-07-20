import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createStableRevisionScheduler,
  REVISION_STABILITY_DELAY_MS,
} from './revisionStability';

describe('stable revision scheduler', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('synchronizes only the latest file set after the tree stays stable', () => {
    vi.useFakeTimers();
    const synchronize = vi.fn();
    const scheduler = createStableRevisionScheduler(synchronize);
    const partial = {
      currentFingerprint: 'partial',
      currentPaths: ['src/a.ts'],
    };
    const complete = {
      currentFingerprint: 'complete',
      currentPaths: ['src/a.ts', 'src/b.ts'],
    };

    scheduler.schedule(partial);
    vi.advanceTimersByTime(REVISION_STABILITY_DELAY_MS - 1);
    expect(synchronize).not.toHaveBeenCalled();

    scheduler.schedule(complete);
    vi.advanceTimersByTime(REVISION_STABILITY_DELAY_MS);

    expect(synchronize).toHaveBeenCalledOnce();
    expect(synchronize).toHaveBeenCalledWith(complete);
  });

  it('cancels pending synchronization when the observer is disposed', () => {
    vi.useFakeTimers();
    const synchronize = vi.fn();
    const scheduler = createStableRevisionScheduler(synchronize);

    scheduler.schedule({
      currentFingerprint: 'partial',
      currentPaths: ['src/a.ts'],
    });
    scheduler.cancel();
    vi.advanceTimersByTime(REVISION_STABILITY_DELAY_MS);

    expect(synchronize).not.toHaveBeenCalled();
  });
});
