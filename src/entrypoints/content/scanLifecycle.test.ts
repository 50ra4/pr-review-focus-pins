import { describe, expect, it } from 'vitest';
import { isCurrentScanResult } from './scanLifecycle';

describe('scan lifecycle', () => {
  it('rejects results from inactive or superseded scans', () => {
    expect(isCurrentScanResult(true, 2, 2)).toBe(true);
    expect(isCurrentScanResult(true, 1, 2)).toBe(false);
    expect(isCurrentScanResult(false, 2, 2)).toBe(false);
  });
});
