# Manual Testing

Build and verify before loading the extension:

```sh
npm run verify:full
```

Load `extension/` through `chrome://extensions` with Developer mode enabled. Do not record private repository names, URLs, file paths, notes, or screenshots in logs or issues.

## Public and private PR checks

Run the same checks on one public PR and one private PR the tester is authorized to view:

1. Open the PR's **Files changed** page and confirm each valid file-tree row gets one pin button.
2. Use only the keyboard to focus a pin button, verify its tooltip, create a `risk` pin with a note, edit it, jump to it, and remove it.
3. Reload and confirm the saved pin returns with its reason and note.
4. Toggle **Show pinned files only** on and off. Confirm every file-tree row returns and no diff body or Viewed state changes.
5. Apply GitHub's file filter, expand delayed content, and toggle Viewed. Confirm pin buttons are not duplicated.
6. Navigate away and back with GitHub SPA links, browser Back, and Forward. Confirm the panel appears only on a `/files` URL and PR scopes do not mix.
7. Open the same PR in two tabs, pin different files at nearly the same time, and confirm both pins remain.
8. Test in GitHub light and dark themes and at a narrow browser width. Confirm focus rings, contrast, and panel access remain usable.
9. When a PR adds/removes files, confirm the change warning appears, existing pins remain, and removed pinned paths are marked **Stale**.
10. Delete this PR's data, then create another pin and delete all data. Reload after each action to confirm deletion.

## Safety checks

- Confirm no network request is initiated by the extension.
- Confirm the built manifest has only `storage`, no host/optional permissions, and no popup/options surface.
- Confirm no GitHub review, comment, approve/request-changes, or Viewed action is sent by the extension.
