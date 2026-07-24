# PR Review Focus Pins

PR Review Focus Pinsは、大規模なGitHub Pull Request内に個人用レビューキューを追加するChrome拡張です。理由とメモを付けてファイルをpinし、pin済みファイルだけへ絞り込み、後日レビューを再開できます。GitHubのViewed状態は変更しません。

[English](../README.md)

## 機能

- GitHub Pull Requestの**Files changed**にある各ファイルへ、キーボード操作可能なpinボタンを1つ追加します。
- `revisit`、`question`、`test`、`risk`、`custom`の理由と、最大200 Unicode文字のメモを保存します。
- GitHubとは別originの単一パネルで、前後移動、編集、解除、stale表示を行います。理由とメモはGitHubのDOMへ描画しません。
- 「pinのみ」はファイルツリーの未pin行だけを隠します。diff本文とGitHubのViewed状態は変えません。
- PRのhead commitとファイル情報からSHA-256 fingerprintを端末内で計算します。GitHubのfile countが取得できる場合はそれを使い、仮想化された部分ツリーを別revisionと誤認しません。取得できない場合は安定した描画済みpath集合を使います。
- repository/PR単位で状態を分離し、GitHubのSPA遷移と遅延描画・再描画へ追従します。
- PR単位または全体の保存データを削除できます。

## プライバシーと権限

pinデータは現在のChrome profileの`chrome.storage.local`だけへ保存します。アカウント、外部backend、解析、crash収集、GitHub API、token、外部通信は使用しません。

| manifest設定                                | 目的                                                                              |
| ------------------------------------------- | --------------------------------------------------------------------------------- |
| `storage`                                   | 端末内のpin storeを永続化します。                                                 |
| `https://github.com/*` content-script match | GitHubが描画したPR file treeへ操作UIを追加します。host permissionではありません。 |

`panel.html`はGitHubからextension-originパネルを埋め込むためだけに公開します。同一オリジン制約によりGitHub側のscriptはパネルDOMを読めず、型付きbridgeを通るのは秘密情報を含まないfile tree状態だけです。

`host_permissions`、`tabs`、`activeTab`、`scripting`、`<all_urls>`は要求しません。詳細は[プライバシーポリシー](privacy-policy.md)と[権限説明](permissions.md)を参照してください。

## 使い方

1. `https://github.com/{owner}/{repository}/pull/{number}/files`を開きます。
2. 対象ファイル横のpinボタンを押します。
3. 理由と任意のメモを入力し、**Save pin**を押します。
4. 右下パネルから絞り込み、移動、編集、解除を行います。
5. PR更新時は新しいrevisionを確認し、**Acknowledge changes**で警告を解除します。

上限は1 PRあたり200 pin、全体500 pin、100 PR scopeです。超過時はエラーを表示し、古いpinを自動削除しません。

## sourceからの導入

Node.js 24以上が必要です。Playwright E2EにはChromiumも必要です。

```sh
npm ci
npm run build
```

`chrome://extensions`でDeveloper modeを有効にし、**Load unpacked**から生成された`extension/`を選択します。

## 開発と検証

```sh
npm run dev
npm run verify
npm run verify:full
npm run package
```

実装は`entrypoints -> lib`の依存方向を維持します。background messagingが全storage mutationを直列化するため、複数PR tabの同時更新を失いません。GitHub DOMへの依存は`githubPrAdapter.ts`へ隔離し、CIは保存済みfixtureだけを使います。

公開・private PRでの確認項目は[手動テスト](manual-testing.md)を参照してください。

## 既知の制限

- GitHub.comのみ対応し、GitHub Enterprise Serverは対象外です。
- GitHubの非公開DOM契約へ依存します。複数抽出戦略をfixtureで検証していますが、将来のUI変更時はadapter修正が必要です。
- 完全なfile treeを確認できた場合だけ、存在しないpinをstaleとして扱います。部分表示・仮想化中に未描画のpinをstaleにはしません。
- pinは端末・Chrome profile内だけに保存され、同期・共有されません。

## 派生元

[`50ra4/crx-vite-ts-react-template` v1.0.0](https://github.com/50ra4/crx-vite-ts-react-template/tree/v1.0.0)から派生しています。

## License

[MIT](../LICENSE)
