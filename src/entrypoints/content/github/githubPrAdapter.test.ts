import { beforeEach, describe, expect, it, vi } from 'vitest';
import fixture50 from './fixtures/pr-files-50.html?raw';
import nestedFixture from './fixtures/pr-files-nested.html?raw';
import rerenderedFixture from './fixtures/pr-files-rerendered.html?raw';
import {
  extractFileTreeItems,
  injectPinButtons,
  parsePrFilesUrl,
  setPinOnlyMode,
} from './githubPrAdapter';

describe('GitHub PR adapter', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it.each([
    ['https://github.com/OpenAI/Codex/pull/42/files', 42],
    ['https://github.com/OpenAI/Codex/pull/42/files?diff=split', 42],
    ['https://github.com/OpenAI/Codex/pull/42/files#diff-a', 42],
  ])('parses a Files changed URL: %s', (url, pullNumber) => {
    expect(parsePrFilesUrl(url)).toEqual({
      owner: 'OpenAI',
      repository: 'Codex',
      pullNumber,
    });
  });

  it.each([
    'http://github.com/a/b/pull/1/files',
    'https://github.com/a/b/pull/1',
    'https://example.com/a/b/pull/1/files',
    'https://github.com/enterprise/a/b/pull/1/files',
  ])('rejects an out-of-scope URL: %s', (url) => {
    expect(parsePrFilesUrl(url)).toBeNull();
  });

  it('extracts more than 50 file rows from a saved fixture', () => {
    document.body.innerHTML = fixture50;
    const result = extractFileTreeItems(document, {
      owner: 'acme',
      repository: 'widgets',
      pullNumber: 77,
    });

    expect(result.items).toHaveLength(51);
    expect(result.items[50].path).toBe('src/features/feature-50.ts');
    expect(result.diagnostics.skipped).toHaveLength(0);
  });

  it('extracts nested paths and skips unknown, duplicate, and invalid rows', () => {
    document.body.innerHTML = nestedFixture;
    const result = extractFileTreeItems(document, {
      owner: 'acme',
      repository: 'widgets',
      pullNumber: 77,
    });

    expect(result.items.map((item) => item.path)).toEqual([
      'src/components/review/FocusPanel.tsx',
      'docs/README.md',
    ]);
    expect(result.diagnostics.skipped.map((item) => item.reason)).toEqual([
      'missing-path',
      'duplicate-path',
      'missing-diff-anchor',
    ]);
  });

  it('injects one button per row idempotently and reinjects after rerender', () => {
    document.body.innerHTML = nestedFixture;
    const scope = { owner: 'acme', repository: 'widgets', pullNumber: 77 };
    const first = extractFileTreeItems(document, scope);

    expect(injectPinButtons(first.items, new Set(['docs/README.md']))).toBe(2);
    expect(injectPinButtons(first.items, new Set(['docs/README.md']))).toBe(0);
    expect(document.querySelectorAll('[data-pr-focus-pin-path]')).toHaveLength(
      2,
    );
    expect(
      document
        .querySelector<HTMLElement>('[data-pr-focus-pin-path="docs/README.md"]')
        ?.getAttribute('aria-pressed'),
    ).toBe('true');

    document.body.innerHTML = rerenderedFixture;
    const rerendered = extractFileTreeItems(document, scope);
    expect(injectPinButtons(rerendered.items, new Set())).toBe(3);
  });

  it('does not mutate rows when injected button state is unchanged', async () => {
    document.body.innerHTML = nestedFixture;
    const items = extractFileTreeItems(document, {
      owner: 'acme',
      repository: 'widgets',
      pullNumber: 77,
    }).items;
    injectPinButtons(items, new Set(['docs/README.md']));
    const onMutation = vi.fn();
    const observer = new MutationObserver(onMutation);
    observer.observe(document.body, { childList: true, subtree: true });

    injectPinButtons(items, new Set(['docs/README.md']));
    await new Promise((resolve) => setTimeout(resolve, 0));

    observer.disconnect();
    expect(onMutation).not.toHaveBeenCalled();
  });

  it('restores every row after pin-only mode is disabled', () => {
    document.body.innerHTML = rerenderedFixture;
    const items = extractFileTreeItems(document, {
      owner: 'acme',
      repository: 'widgets',
      pullNumber: 77,
    }).items;

    setPinOnlyMode(items, new Set(['src/a.ts']), true);
    expect(items[0].rowElement.classList).not.toContain(
      'pr-focus-pins__hidden-row',
    );
    expect(items[1].rowElement.classList).toContain(
      'pr-focus-pins__hidden-row',
    );

    setPinOnlyMode(items, new Set(), false);
    expect(
      items.some((item) =>
        item.rowElement.classList.contains('pr-focus-pins__hidden-row'),
      ),
    ).toBe(false);
  });
});
