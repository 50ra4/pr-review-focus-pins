import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test } from './fixtures';

const fixturePath = resolve(process.cwd(), 'e2e/pages/github-pr-fixture.html');
const stagedFixturePath = resolve(
  process.cwd(),
  'e2e/pages/github-pr-staged-fixture.html',
);
const prUrl = 'https://github.com/acme/widgets/pull/77/files';
const panelSelector = '#pr-review-focus-pins-panel';

test.beforeEach(async ({ extensionPage }) => {
  const html = await readFile(fixturePath, 'utf8');
  await extensionPage.route('https://github.com/**', (route) =>
    route.fulfill({ body: html, contentType: 'text/html' }),
  );
  await extensionPage.goto(prUrl);
});

test('pins, filters, restores, detects changes, and marks stale paths', async ({
  extensionPage,
}) => {
  const panel = extensionPage.frameLocator(panelSelector);
  const pinButtons = extensionPage.locator('[data-pr-focus-pin-path]');
  await expect(pinButtons).toHaveCount(3);

  await extensionPage
    .locator('[data-pr-focus-pin-path="src/security.ts"]')
    .click();
  await panel.getByLabel('Reason').selectOption('risk');
  await panel.getByLabel('Note').fill('Review auth boundary');
  await panel.getByRole('button', { name: 'Save pin' }).click();

  await expect(
    extensionPage.locator(
      '[data-pr-focus-pin-path="src/security.ts"][aria-pressed="true"]',
    ),
  ).toHaveCount(1);

  await extensionPage.reload();
  await expect(
    extensionPage.locator(
      '[data-pr-focus-pin-path="src/security.ts"][aria-pressed="true"]',
    ),
  ).toHaveCount(1);
  await expect(panel.getByText('Review auth boundary')).toBeVisible();
  const isolation = await extensionPage
    .locator(panelSelector)
    .evaluate((element) => {
      const frame = element as HTMLIFrameElement;
      return {
        contentDocumentIsNull: frame.contentDocument === null,
        extensionOrigin: frame.src.startsWith('chrome-extension://'),
        noteLeakedToPage: document.body.innerText.includes(
          'Review auth boundary',
        ),
      };
    });
  expect(isolation).toEqual({
    contentDocumentIsNull: true,
    extensionOrigin: true,
    noteLeakedToPage: false,
  });

  await panel.getByLabel('Show pinned files only').check();
  await expect(extensionPage.locator('.pr-focus-pins__hidden-row')).toHaveCount(
    2,
  );
  await panel.getByLabel('Show pinned files only').uncheck();
  await expect(extensionPage.locator('.pr-focus-pins__hidden-row')).toHaveCount(
    0,
  );

  await extensionPage.evaluate(() => {
    const tree = document.querySelector('[data-file-tree]');
    const row = document.createElement('li');
    row.dataset.fileTreeItem = '';
    row.innerHTML =
      '<a title="src/new.ts" href="/acme/widgets/pull/77/files#diff-new">new.ts</a>';
    tree?.append(row);
    tree?.setAttribute(
      'data-hydro-click-payload',
      JSON.stringify({
        payload: { category: 'file_tree', data: { file_count: 4 } },
      }),
    );
    const diff = document.createElement('div');
    diff.id = 'diff-new';
    document.body.append(diff);
  });
  await expect(panel.getByText('PR changed since last review')).toBeVisible();

  await extensionPage.evaluate(() => {
    document.querySelector('[data-file-tree-item="security"]')?.remove();
    document.querySelector('#diff-security')?.remove();
  });
  await expect(panel.getByText('Stale')).toBeVisible();
  await panel.getByRole('button', { name: 'Remove src/security.ts' }).click();
  await expect(panel.getByText('Review auth boundary')).toHaveCount(0);
});

test('manifest exposes only the required surfaces and permission', async () => {
  const manifest = JSON.parse(
    await readFile(resolve(process.cwd(), 'extension/manifest.json'), 'utf8'),
  ) as Record<string, unknown>;

  expect(manifest.permissions).toEqual(['storage']);
  expect(manifest).not.toHaveProperty('action');
  expect(manifest).not.toHaveProperty('options_ui');
  expect(JSON.stringify(manifest)).not.toContain('http://');
  expect(JSON.stringify(manifest.web_accessible_resources)).toContain(
    'panel.html',
  );
});

test('waits for staged file-tree rendering before recording the revision', async ({
  extensionPage,
}) => {
  const panel = extensionPage.frameLocator(panelSelector);
  const html = await readFile(stagedFixturePath, 'utf8');
  await extensionPage.unroute('https://github.com/**');
  await extensionPage.route('https://github.com/**', (route) =>
    route.fulfill({ body: html, contentType: 'text/html' }),
  );
  await extensionPage.goto('https://github.com/acme/widgets/pull/78/files');

  await expect(extensionPage.locator('[data-pr-focus-pin-path]')).toHaveCount(
    2,
  );
  await extensionPage.waitForTimeout(500);
  await expect(panel.getByText('PR changed since last review')).toHaveCount(0);

  await extensionPage.evaluate(() => {
    const tree = document.querySelector('[data-file-tree]');
    const row = document.createElement('li');
    row.dataset.fileTreeItem = 'new';
    row.innerHTML =
      '<a title="src/new.ts" href="/acme/widgets/pull/78/files#diff-new">new.ts</a>';
    tree?.append(row);
    tree?.setAttribute(
      'data-hydro-click-payload',
      JSON.stringify({
        payload: { category: 'file_tree', data: { file_count: 3 } },
      }),
    );
    const diff = document.createElement('div');
    diff.id = 'diff-new';
    document.querySelector('main')?.append(diff);
  });
  await expect(panel.getByText('PR changed since last review')).toBeVisible();
});

test('panel remains visible in a narrow dark viewport', async ({
  extensionPage,
}) => {
  const panelFrame = extensionPage.frameLocator(panelSelector);
  await extensionPage.setViewportSize({ width: 375, height: 667 });
  await extensionPage.emulateMedia({
    colorScheme: 'dark',
    reducedMotion: 'reduce',
  });

  const panel = panelFrame.getByRole('region', {
    name: 'PR Review Focus Pins',
  });
  await expect(panel).toBeVisible();
  const layout = await panel.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return {
      background: getComputedStyle(element).backgroundColor,
      bottom: bounds.bottom,
      right: bounds.right,
      width: bounds.width,
    };
  });

  expect(layout.width).toBeLessThanOrEqual(343);
  expect(layout.right).toBeLessThanOrEqual(375);
  expect(layout.bottom).toBeLessThanOrEqual(667);
  expect(layout.background).toBe('rgb(13, 17, 23)');
});
