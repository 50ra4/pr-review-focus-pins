import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test } from './fixtures';

const fixturePath = resolve(process.cwd(), 'e2e/pages/github-pr-fixture.html');
const prUrl = 'https://github.com/acme/widgets/pull/77/files';

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
  const pinButtons = extensionPage.locator('[data-pr-focus-pin-path]');
  await expect(pinButtons).toHaveCount(3);

  await extensionPage
    .locator('[data-pr-focus-pin-path="src/security.ts"]')
    .click();
  await extensionPage.getByLabel('Reason').selectOption('risk');
  await extensionPage.getByLabel('Note').fill('Review auth boundary');
  await extensionPage.getByRole('button', { name: 'Save pin' }).click();

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
  await expect(extensionPage.getByText('Review auth boundary')).toBeVisible();

  await extensionPage.getByLabel('Show pinned files only').check();
  await expect(extensionPage.locator('.pr-focus-pins__hidden-row')).toHaveCount(
    2,
  );
  await extensionPage.getByLabel('Show pinned files only').uncheck();
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
    const diff = document.createElement('div');
    diff.id = 'diff-new';
    document.body.append(diff);
  });
  await expect(
    extensionPage.getByText('PR changed since last review'),
  ).toBeVisible();

  await extensionPage.evaluate(() => {
    document.querySelector('[data-file-tree-item="security"]')?.remove();
    document.querySelector('#diff-security')?.remove();
  });
  await expect(extensionPage.getByText('Stale')).toBeVisible();
  await extensionPage
    .getByRole('button', { name: 'Remove src/security.ts' })
    .click();
  await expect(extensionPage.getByText('Review auth boundary')).toHaveCount(0);
});

test('manifest exposes only the required surfaces and permission', async () => {
  const manifest = JSON.parse(
    await readFile(resolve(process.cwd(), 'extension/manifest.json'), 'utf8'),
  ) as Record<string, unknown>;

  expect(manifest.permissions).toEqual(['storage']);
  expect(manifest).not.toHaveProperty('action');
  expect(manifest).not.toHaveProperty('options_ui');
  expect(JSON.stringify(manifest)).not.toContain('http://');
});
