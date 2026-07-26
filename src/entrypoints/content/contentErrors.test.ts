import { describe, expect, it } from 'vitest';
import {
  EMPTY_CONTENT_ERRORS,
  getVisibleContentError,
  reduceContentErrors,
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
