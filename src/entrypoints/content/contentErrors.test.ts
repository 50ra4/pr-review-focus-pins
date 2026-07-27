import { describe, expect, it } from 'vitest';
import {
  EMPTY_CONTENT_ERRORS,
  getVisibleContentError,
  isCurrentScanResult,
  reduceContentErrors,
  runContentSync,
} from './contentErrors';

describe('content error state', () => {
  it('does not clear a messaging error when a later scan succeeds', () => {
    const failed = reduceContentErrors(EMPTY_CONTENT_ERRORS, {
      message: 'Storage mutation failed.',
      source: 'sync',
    });
    const scanRecovered = reduceContentErrors(failed, {
      message: '',
      source: 'scan',
    });

    expect(scanRecovered.sync).toBe('Storage mutation failed.');
    expect(getVisibleContentError(scanRecovered)).toBe(
      'Storage mutation failed.',
    );
  });

  it('clears a messaging error when a later messaging operation succeeds', async () => {
    const failed = reduceContentErrors(EMPTY_CONTENT_ERRORS, {
      message: 'Storage mutation failed.',
      source: 'sync',
    });
    const withScanError = reduceContentErrors(failed, {
      message: 'Revision metadata is ambiguous.',
      source: 'scan',
    });
    const syncRecovered = reduceContentErrors(
      withScanError,
      await runContentSync(async () => undefined),
    );

    expect(syncRecovered.sync).toBe('');
    expect(getVisibleContentError(syncRecovered)).toBe(
      'Revision metadata is ambiguous.',
    );
  });

  it('returns a messaging error when the messaging operation fails', async () => {
    const action = await runContentSync(async () => {
      throw new Error('Storage mutation failed.');
    });

    expect(action).toEqual({
      message: 'Storage mutation failed.',
      source: 'sync',
    });
  });

  it('rejects messaging outcomes from inactive or superseded scans', () => {
    expect(isCurrentScanResult(true, 2, 2)).toBe(true);
    expect(isCurrentScanResult(true, 1, 2)).toBe(false);
    expect(isCurrentScanResult(false, 2, 2)).toBe(false);
  });

  it('keeps scan diagnostics visible alongside persistent operation errors', () => {
    const withSyncError = reduceContentErrors(EMPTY_CONTENT_ERRORS, {
      message: 'Storage mutation failed.',
      source: 'sync',
    });
    const withBoth = reduceContentErrors(withSyncError, {
      message: 'Revision metadata is ambiguous.',
      source: 'scan',
    });

    expect(getVisibleContentError(withBoth)).toBe(
      'Storage mutation failed. Revision metadata is ambiguous.',
    );
  });
});
