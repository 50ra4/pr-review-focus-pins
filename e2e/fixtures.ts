import { access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  chromium,
  expect,
  test as base,
  type BrowserContext,
  type Page,
} from '@playwright/test';

type TestFixtures = {
  extensionPage: Page;
};

type WorkerFixtures = {
  extensionContext: BrowserContext;
};

export const test = base.extend<TestFixtures, WorkerFixtures>({
  extensionContext: [
    // Playwright requires the fixture dependency argument to use object destructuring.
    // oxlint-disable-next-line no-empty-pattern
    async ({}, provide) => {
      const extensionPath = resolve(process.cwd(), 'extension');
      await access(join(extensionPath, 'manifest.json')).catch(() => {
        throw new Error(
          'E2E requires extension/manifest.json. Run "npm run build" first.',
        );
      });
      const temporaryDirectory = await mkdtemp(join(tmpdir(), 'focus-pins-'));
      let context: BrowserContext | undefined;

      try {
        context = await chromium.launchPersistentContext(
          join(temporaryDirectory, 'user-data'),
          {
            channel: 'chromium',
            headless: true,
            args: [
              `--disable-extensions-except=${extensionPath}`,
              `--load-extension=${extensionPath}`,
            ],
          },
        );
        await provide(context);
      } finally {
        await context?.close();
        await rm(temporaryDirectory, { recursive: true, force: true });
      }
    },
    { scope: 'worker' },
  ],

  extensionPage: async ({ extensionContext }, provide) => {
    const page = await extensionContext.newPage();
    try {
      await provide(page);
    } finally {
      await page.close();
    }
  },
});

export { expect };
