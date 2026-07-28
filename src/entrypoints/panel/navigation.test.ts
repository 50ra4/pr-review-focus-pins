import { describe, expect, it } from 'vitest';
import { getRelativePath } from './navigation';

describe('pin navigation', () => {
  it('moves relative to the current path after the list changes', () => {
    expect(getRelativePath(['a', 'b', 'c'], 'b', 1)).toBe('c');
    expect(getRelativePath(['b', 'c'], 'b', 1)).toBe('c');
    expect(getRelativePath(['a', 'b'], 'b', 1)).toBe('a');
  });

  it('restarts at the appropriate edge when the current path is gone', () => {
    expect(getRelativePath(['b', 'c'], 'a', 1)).toBe('b');
    expect(getRelativePath(['b', 'c'], 'a', -1)).toBe('c');
  });

  it('returns null when no paths are available', () => {
    expect(getRelativePath([], 'a', 1)).toBeNull();
  });
});
