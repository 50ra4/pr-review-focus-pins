# PR Review Focus Pins

PR Review Focus Pins is a Chrome extension for keeping a private review queue inside large GitHub pull requests. Pin files with a reason and note, filter the file tree to pinned files, and resume the review later without changing GitHub's Viewed state.

[日本語](docs/README.ja.md)

## Features

- Adds one keyboard-accessible focus-pin button to each file in a GitHub pull request's **Files changed** tree.
- Stores a reason (`revisit`, `question`, `test`, `risk`, or `custom`) and a note of up to 200 Unicode characters.
- Shows all pins in a cross-origin extension panel with previous/next navigation, editing, removal, and stale-file status. Reasons and notes are never rendered into GitHub's DOM.
- Filters only unpinned rows in the file tree. Diff contents and GitHub's Viewed state are never changed.
- Detects a changed PR head or file set with a local SHA-256 fingerprint. It uses GitHub's file count when available so a virtualized partial tree does not create a false revision, and otherwise uses the stabilized rendered paths.
- Keeps each repository/pull-request scope separate and follows GitHub SPA navigation and delayed tree rendering.
- Deletes one PR's data or all extension data on demand.

## Privacy and permissions

All pin data stays in `chrome.storage.local` on the current Chrome profile. The extension has no account, backend, analytics, crash SDK, GitHub API integration, token access, or external network requests.

| Manifest access                             | Purpose                                                                                                |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `storage`                                   | Persist the local pin store.                                                                           |
| `https://github.com/*` content-script match | Add controls to GitHub's rendered PR file tree. This is a content-script match, not a host permission. |

`panel.html` is exposed only so GitHub can embed the extension-origin panel. Browser same-origin enforcement prevents GitHub page scripts from reading its DOM; only non-secret file-tree state crosses the typed panel bridge.

The extension does not request `host_permissions`, `tabs`, `activeTab`, `scripting`, or `<all_urls>`. See the [privacy policy](docs/privacy-policy.md) and [Chrome Web Store permission explanation](docs/permissions.md).

## Usage

1. Open `https://github.com/{owner}/{repository}/pull/{number}/files`.
2. Activate the pin button next to a file.
3. Choose a reason, add an optional note, and select **Save pin**.
4. Use the lower-right panel to filter, navigate, edit, or remove pins.
5. When the PR changes, review the new revision and select **Acknowledge changes** to clear the warning.

The limits are 200 pins per PR, 500 pins total, and 100 PR scopes. The extension reports a limit error and never evicts old pins automatically.

## Install from source

Requirements: Node.js 24 or newer and Chromium installed for Playwright E2E.

```sh
npm ci
npm run build
```

Then open `chrome://extensions`, enable Developer mode, select **Load unpacked**, and choose the generated `extension/` directory.

## Development and verification

```sh
npm run dev          # Vite/CRXJS development build
npm run verify       # types, lint, unit tests, build, manifest contract
npm run verify:full  # verify plus real-Chromium extension E2E
npm run package      # reproducible extension.zip
```

The implementation keeps the dependency direction `entrypoints -> lib`. Background messaging serializes every storage mutation so simultaneous PR tabs cannot overwrite each other. DOM selectors and fallbacks are isolated in `githubPrAdapter.ts`; tests use saved fixtures and never fetch GitHub in CI.

See [manual testing](docs/manual-testing.md) for public/private PR checks.

## Known limitations

- Supports GitHub.com only, not GitHub Enterprise Server.
- Depends on GitHub's non-public file-tree DOM. Multiple extraction strategies are covered by fixtures, but a future GitHub redesign can require an adapter update.
- A pin is marked stale only after the extension has a complete file-tree snapshot. Partial or virtualized trees do not mark temporarily unrendered pins stale.
- Pins are device/profile-local and are not synchronized or shared.

## Provenance

This repository was derived from [`50ra4/crx-vite-ts-react-template` v1.0.0](https://github.com/50ra4/crx-vite-ts-react-template/tree/v1.0.0).

## License

[MIT](LICENSE)
