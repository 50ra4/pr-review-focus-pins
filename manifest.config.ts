import { defineManifest } from '@crxjs/vite-plugin';
import { name, version } from './package.json';
import { createManifestVersion } from './scripts/manifest-version.mjs';

const manifestVersion = createManifestVersion(version);

const EXTENSION_NAMES = {
  build: name,
  serve: `[DEV] ${name}`,
} as const;

const createIconFileSuffix = (command: 'build' | 'serve') =>
  command === 'serve' ? '-dev' : '';

// import to `vite.config.ts`
export default defineManifest(({ command }) => ({
  ...manifestVersion,
  manifest_version: 3,
  name: EXTENSION_NAMES[command],
  description:
    'Private, local focus pins for reviewing large GitHub pull requests.',
  icons: {
    '16': `public/logo/icon16${createIconFileSuffix(command)}.png`,
    '48': `public/logo/icon48${createIconFileSuffix(command)}.png`,
    '128': `public/logo/icon128${createIconFileSuffix(command)}.png`,
  },
  ...(command === 'build'
    ? {
        content_security_policy: {
          extension_pages: "script-src 'self'; object-src 'self';",
        },
      }
    : {}),
  // Declare only permissions for Chrome APIs that the extension actually uses.
  // Keep the allowlists in scripts/verify-manifest.mjs in sync when adding one.
  permissions: ['storage'],
  content_scripts: [
    {
      matches: ['https://github.com/*'],
      js: ['src/entrypoints/content/prFocusPins.tsx'],
      run_at: 'document_idle',
    },
  ],
  background: {
    service_worker: 'src/entrypoints/background/background.ts',
  },
}));
