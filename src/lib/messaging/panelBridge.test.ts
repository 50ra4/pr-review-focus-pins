import { describe, expect, it } from 'vitest';
import {
  isContentToPanelMessage,
  isPanelToContentMessage,
} from './panelBridge';

describe('panel bridge guards', () => {
  it('accepts the non-secret file-tree snapshot', () => {
    expect(
      isContentToPanelMessage({
        type: 'snapshot',
        colorMode: 'dark',
        currentFingerprint: 'fingerprint',
        currentPaths: ['src/a.ts'],
        error: '',
        uiNotRecognized: false,
      }),
    ).toBe(true);
  });

  it('rejects malformed commands and paths', () => {
    expect(isPanelToContentMessage({ type: 'jump', path: '' })).toBe(false);
    expect(
      isPanelToContentMessage({ type: 'setPinOnly', enabled: 'yes' }),
    ).toBe(false);
    expect(isContentToPanelMessage({ type: 'selectPath', path: '/' })).toBe(
      false,
    );
  });
});
