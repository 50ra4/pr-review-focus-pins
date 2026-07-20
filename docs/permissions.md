# Chrome Web Store Permission Explanation

## `storage`

Required to save the user's private review pins, reasons, notes, PR scope, and revision fingerprints in `chrome.storage.local`. Data is not stored in `storage.sync` and is not transmitted externally.

## Content-script match: `https://github.com/*`

Required so the extension can follow GitHub's client-side navigation and activate only when the current URL matches `/{owner}/{repository}/pull/{number}/files`. The script adds pin controls to the rendered file tree and embeds `panel.html` as a cross-origin extension iframe. Reasons and notes remain inside that extension origin and are not rendered into GitHub's DOM. On every other GitHub URL, it does not start its DOM observer, display UI, or synchronize storage.

This match is not a `host_permissions` grant. The extension requests no host permissions and makes no GitHub API or other network requests.

`panel.html` is listed in `web_accessible_resources` for this embed only. Same-origin enforcement prevents the host page from reading the panel document. The typed parent/iframe bridge carries current file paths, the local revision fingerprint, UI status, and navigation commands; it never carries saved reasons or notes.

## Permissions deliberately not requested

- `tabs`
- `activeTab`
- `scripting`
- `identity`
- `webRequest`
- `host_permissions`
- `optional_permissions`
- `<all_urls>`

The extension also declares no `externally_connectable` configuration.
