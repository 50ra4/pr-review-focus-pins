import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFileTreeStability } from './fileTreeStability';

describe('file tree stability', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('accepts an unchanged tree without relying on GitHub analytics metadata', () => {
    vi.useFakeTimers();
    const onStable = vi.fn();
    const stability = createFileTreeStability(onStable);

    expect(stability.observe('first', 2)).toBe(false);
    vi.advanceTimersByTime(2_100);

    expect(onStable).toHaveBeenCalledOnce();
    expect(stability.observe('first', 2)).toBe(true);
  });

  it('restarts stabilization when a delayed file row changes the tree', () => {
    vi.useFakeTimers();
    const onStable = vi.fn();
    const stability = createFileTreeStability(onStable);

    stability.observe('partial', 1);
    vi.advanceTimersByTime(1_500);
    stability.observe('complete', 2);
    vi.advanceTimersByTime(700);
    expect(onStable).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1_400);
    expect(onStable).toHaveBeenCalledOnce();
    expect(stability.observe('complete', 2)).toBe(true);
    expect(stability.observe('later-change', 3)).toBe(false);
  });
});
