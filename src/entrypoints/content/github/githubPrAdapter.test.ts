import { beforeEach, describe, expect, it, vi } from 'vitest';
import fixture50 from './fixtures/pr-files-50.html?raw';
import nestedFixture from './fixtures/pr-files-nested.html?raw';
import rerenderedFixture from './fixtures/pr-files-rerendered.html?raw';
import {
  describeRevisionFailure,
  extractFileTreeItems,
  extractPrHeadCommit,
  extractPrRevision,
  hasFileTreeMutation,
  hasPrHeadMutation,
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

  it('reports completeness only when the extracted tree matches GitHub file_count', () => {
    document.body.innerHTML = nestedFixture;
    const tree = document.querySelector('[data-file-tree]');
    tree?.setAttribute(
      'data-hydro-click-payload',
      JSON.stringify({
        payload: { category: 'file_tree', data: { file_count: 3 } },
      }),
    );
    const scope = { owner: 'acme', repository: 'widgets', pullNumber: 77 };

    const partial = extractFileTreeItems(document, scope);
    expect(partial.diagnostics.expectedFileCount).toBe(3);
    expect(partial.diagnostics.complete).toBe(false);

    tree?.setAttribute(
      'data-hydro-click-payload',
      JSON.stringify({
        payload: { category: 'file_tree', data: { file_count: 2 } },
      }),
    );
    const complete = extractFileTreeItems(document, scope);
    expect(complete.diagnostics.complete).toBe(true);
  });

  it('reports a file tree without file_count as requiring fallback stabilization', () => {
    document.body.innerHTML = nestedFixture;

    const result = extractFileTreeItems(document, {
      owner: 'acme',
      repository: 'widgets',
      pullNumber: 77,
    });

    expect(result.items).toHaveLength(2);
    expect(result.diagnostics.expectedFileCount).toBeNull();
    expect(result.diagnostics.complete).toBe(false);
  });

  it('extracts the scoped diff-range head for a multi-commit merge topology', () => {
    document.body.innerHTML = `
      <div class="js-diffbar-range-list">
        <a data-commit="${'a'.repeat(40)}" href="/acme/widgets/pull/77/commits/${'a'.repeat(40)}">first branch</a>
        <a data-commit="${'b'.repeat(40)}" href="/acme/widgets/pull/77/commits/${'b'.repeat(40)}">second branch</a>
        <a data-commit="${'c'.repeat(40)}" data-parent-commit="${'a'.repeat(40)}" href="/acme/widgets/pull/77/commits/${'c'.repeat(40)}">merge commit</a>
      </div>
      <details-menu
        src="/acme/widgets/pull/77/show_toc?base_sha=${'0'.repeat(40)}&sha1=${'0'.repeat(40)}&sha2=${'c'.repeat(40)}"
      ></details-menu>
    `;

    expect(
      extractPrHeadCommit(document, {
        owner: 'acme',
        repository: 'widgets',
        pullNumber: 77,
      }),
    ).toBe('c'.repeat(40));
  });

  it('prefers the scoped diff-range head when lower-priority metadata differs', () => {
    document.body.innerHTML = `
      <div data-url="/acme/widgets/pull/77/show_partial_comparison?end_commit_oid=${'a'.repeat(40)}"></div>
      <details-menu src="/acme/widgets/pull/77/show_toc?sha2=${'b'.repeat(40)}"></details-menu>
    `;

    expect(
      extractPrHeadCommit(document, {
        owner: 'acme',
        repository: 'widgets',
        pullNumber: 77,
      }),
    ).toBe('a'.repeat(40));
  });

  it('falls through ambiguous and unscoped head OIDs to scoped metadata', () => {
    document.body.innerHTML = `
      <form action="/acme/widgets/pull/77/files">
        <span data-head-oid="${'a'.repeat(40)}"></span>
        <span data-head-oid="${'b'.repeat(40)}"></span>
      </form>
      <span data-head-oid="${'d'.repeat(40)}"></span>
      <div data-url="/acme/widgets/pull/77/show_partial_comparison?end_commit_oid=${'c'.repeat(40)}"></div>
    `;

    const result = extractPrRevision(document, {
      owner: 'acme',
      repository: 'widgets',
      pullNumber: 77,
    });

    expect(result.commit).toBe('c'.repeat(40));
    expect(result.diagnostics.selectedSource).toBe('end-commit-oid');
    expect(result.diagnostics.sources[0]).toMatchObject({
      candidateCount: 3,
      outOfScopeCount: 1,
      source: 'head-oid',
      uniqueCommitCount: 2,
      validCount: 2,
    });
  });

  it('describes why every revision source was rejected without exposing SHAs', () => {
    document.body.innerHTML = `
      <span data-head-oid="${'a'.repeat(40)}"></span>
      <div data-url="/acme/widgets/pull/77/show_partial_comparison?end_commit_oid=invalid"></div>
    `;

    const result = extractPrRevision(document, {
      owner: 'acme',
      repository: 'widgets',
      pullNumber: 77,
    });
    const message = describeRevisionFailure(result.diagnostics);

    expect(result.commit).toBeNull();
    expect(message).toContain('head-oid: out-of-scope');
    expect(message).toContain('end-commit-oid: invalid');
    expect(message).toContain('toc-sha2: missing');
    expect(message).not.toContain('a'.repeat(40));
  });

  it.each([
    [
      `<div data-head-oid="${'a'.repeat(40)}" data-url="/acme/widgets/pull/77/files"></div>`,
      'a'.repeat(40),
    ],
    [
      `<div data-url="/acme/widgets/pull/77/comparison?end_commit_oid=${'b'.repeat(40)}"></div>`,
      'b'.repeat(40),
    ],
    [
      `<details-menu src="/acme/widgets/pull/77/show_toc?sha2=${'c'.repeat(40)}"></details-menu>`,
      'c'.repeat(40),
    ],
  ])(
    'extracts the PR head from fallback revision metadata',
    (html, expected) => {
      document.body.innerHTML = html;

      expect(
        extractPrHeadCommit(document, {
          owner: 'acme',
          repository: 'widgets',
          pullNumber: 77,
        }),
      ).toBe(expected);
    },
  );

  it('detects revision metadata changes even when another strategy is present', async () => {
    document.body.innerHTML = `
      <div data-head-oid="${'a'.repeat(40)}"></div>
      <main></main>
    `;
    const collectMutation = (mutate: () => void): Promise<MutationRecord[]> =>
      new Promise((resolve) => {
        const observer = new MutationObserver((records) => {
          observer.disconnect();
          resolve(records);
        });
        observer.observe(document.body, {
          attributeFilter: ['data-head-oid', 'data-url', 'src'],
          attributeOldValue: true,
          attributes: true,
          childList: true,
          subtree: true,
        });
        mutate();
      });

    const unrelated = await collectMutation(() => {
      document.querySelector('main')?.append(document.createElement('span'));
    });
    expect(hasPrHeadMutation(unrelated)).toBe(false);

    const revisionChild = await collectMutation(() => {
      document
        .querySelector('[data-head-oid]')
        ?.append(document.createElement('span'));
    });
    expect(hasPrHeadMutation(revisionChild)).toBe(false);

    const revision = await collectMutation(() => {
      document
        .querySelector('[data-head-oid]')
        ?.setAttribute('data-head-oid', 'b'.repeat(40));
    });
    expect(hasPrHeadMutation(revision)).toBe(true);

    const removedRevision = await collectMutation(() => {
      document
        .querySelector('[data-head-oid]')
        ?.removeAttribute('data-head-oid');
    });
    expect(hasPrHeadMutation(removedRevision)).toBe(true);

    const addedRevision = await collectMutation(() => {
      const metadata = document.createElement('details-menu');
      metadata.setAttribute(
        'src',
        `/acme/widgets/pull/77/show_toc?sha2=${'c'.repeat(40)}`,
      );
      document.querySelector('main')?.append(metadata);
    });
    expect(hasPrHeadMutation(addedRevision)).toBe(true);
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

  it('ignores unrelated body mutations and detects file-tree mutations', async () => {
    document.body.innerHTML = `${nestedFixture}<main id="diffs"></main>`;
    const collectMutation = (mutate: () => void): Promise<MutationRecord[]> =>
      new Promise((resolve) => {
        const observer = new MutationObserver((records) => {
          observer.disconnect();
          resolve(records);
        });
        observer.observe(document.body, { childList: true, subtree: true });
        mutate();
      });

    const unrelated = await collectMutation(() => {
      document.querySelector('#diffs')?.append(document.createElement('span'));
    });
    expect(hasFileTreeMutation(unrelated, document)).toBe(false);

    const related = await collectMutation(() => {
      document
        .querySelector('[data-file-tree]')
        ?.append(document.createElement('li'));
    });
    expect(hasFileTreeMutation(related, document)).toBe(true);
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
