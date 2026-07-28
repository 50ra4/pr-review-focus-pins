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
   Confirm the panel iframe uses a `chrome-extension://` URL, its `contentDocument` is inaccessible from the GitHub page, and the note is absent from `document.body.innerText`.
4. Toggle **Show pinned files only** on and off. Confirm every file-tree row returns and no diff body or Viewed state changes.
5. Apply GitHub's file filter, expand delayed content, and toggle Viewed. Confirm pin buttons are not duplicated.
6. Navigate away and back with GitHub SPA links, browser Back, and Forward. Confirm the panel appears only on a `/files` URL and PR scopes do not mix.
7. Open the same PR in two tabs, pin different files at nearly the same time, and confirm both pins remain.
8. Test in GitHub light and dark themes and at a narrow browser width. Confirm focus rings, contrast, and panel access remain usable.
9. Push a change that modifies only an already listed file and confirm the change warning appears even though the path set is unchanged. Select **Acknowledge changes** and confirm the warning clears.
10. On a PR with 100 or more files, confirm pins can be saved even when GitHub virtualizes the tree and the rendered row count never reaches `file_count`. Confirm loading does not show “GitHub UI not recognized,” scrolling does not create a false revision warning, and temporarily unrendered pins are not marked **Stale**.
11. Open a multi-commit PR and a PR whose branch contains a merge commit. Confirm both pages identify the current head, allow pins to be saved, and detect a subsequent head update without depending on commit-list ordering. Record the candidate count for `[data-head-oid]`, `[data-url*="end_commit_oid="]`, and `details-menu[src*="sha2="]`, plus the panel iframe's `data-pr-focus-revision-source`. When `data-head-oid` exists and is scoped to the current PR, require `head-oid`; when it is absent, require a scoped fallback source and record the absence instead of fabricating scope attributes. If identification fails, record the source-specific rejection diagnostics shown in the panel.
12. When a complete tree adds or removes files, confirm the change warning appears, existing pins remain, and removed pinned paths are marked **Stale**.
13. Delete this PR's data, then create another pin and delete all data. Corrupt or replace the stored schema in a disposable profile and confirm **Delete all pin data** still restores normal operation. Reload after each action to confirm deletion.

## Safety checks

- Confirm no network request is initiated by the extension.
- Confirm the built manifest has only `storage`, no host/optional permissions, and no popup/options surface.
- Confirm no GitHub review, comment, approve/request-changes, or Viewed action is sent by the extension.
