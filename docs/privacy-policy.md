# Privacy Policy

Effective date: July 20, 2026

PR Review Focus Pins processes GitHub pull-request file paths and user-created pin reasons and notes only to provide its review-queue functionality.

## Data stored

The extension stores the following in `chrome.storage.local` in the current Chrome profile:

- GitHub repository owner and repository name
- Pull request number
- Pinned file paths, reason, note, and local timestamps
- File-tree revision fingerprints used to detect changes

Storage is limited to 200 pins per pull request, 500 pins total, and 100 pull-request scopes.

## Data transmission and collection

The extension does not transmit, sell, share, or remotely collect this data. It has no backend, analytics SDK, crash-reporting SDK, advertising, remote configuration, GitHub API usage, or GitHub token access. It does not use remotely hosted code.

The content script reads only the rendered file tree on GitHub pull-request **Files changed** pages. It does not collect page contents in the background or send page data anywhere.

## Deletion and retention

Data remains until the user removes a pin, deletes one pull request's data, deletes all pin data from the extension panel, clears extension storage, or uninstalls the extension. No automatic eviction occurs when a limit is reached.

## Permissions

The extension uses the `storage` permission and runs a content script on `https://github.com/*`. It does not request host permissions or `<all_urls>`. See [permissions.md](permissions.md) for the complete rationale.

## Changes

Material policy changes will be published with a new extension version and an updated effective date in this file.

## Contact

Report privacy questions through the repository's [issue tracker](https://github.com/50ra4/pr-review-focus-pins/issues).
