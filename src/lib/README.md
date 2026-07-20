# src/lib

entrypoints から利用する共有モジュールの置き場です。

- 依存方向は `entrypoints → lib` のみ許可。`lib` から `entrypoints` への import は禁止
- Chrome API の実参照は `src/lib/` 内だけで許可。entrypoints などからは lib のラッパーを利用する
- 例外が不可避な場合は `oxlint-disable` コメントに理由を記載し、境界違反を顕在化する

テストでは `src/lib/testing/chromeFake.ts` の `installChromeFake` を使う。runtime
messaging と storage(local / managed / session / sync)を in-memory で再現し、
`vi.stubGlobal` でテストごとに注入できる。

## messaging(`src/lib/messaging/`)

`panelBridge.ts` defines the validated `postMessage` contract between the GitHub content script and the cross-origin extension panel. The bridge never carries saved reasons or notes.

Extension context間(content ↔ background)の型安全なmessagingレイヤー。
依存ゼロの自前実装。

- `createMessaging.ts` — 汎用エンジン(`createMessaging` / `defineMessage`)。触らなくてよい
- `messages.ts` — アプリのメッセージ契約。**新しいメッセージはここに1件追加するだけ**

### 使い方

1. `messages.ts` の `messages` に契約を追加(request / response の実行時ガードを宣言):

   ```ts
   export const messages = {
     removePin: defineMessage(isRemovePinRequest, isPinStoreV1),
   } as const;
   ```

2. 送信側(content)は`sendMessage(name, payload)`。payload / 戻り値は型推論される:

   ```ts
   const store = await sendMessage('removePin', { scope, path });
   ```

3. 受信側(background)は `addMessageListeners`。検証済みの型付き payload を受け取る:

   ```ts
   addMessageListeners({
     removePin: (payload) => mutateStore((store) => removePin(store, payload)),
   });
   ```

`sender.id !== chrome.runtime.id` の発信・未知メッセージ・payload ガード不合格は
**既定で拒否**される。tabs / Port(長寿命接続)は未対応(必要時に拡張)。

## pins(`src/lib/pins/`)

pinの型、runtime guard、path/scope正規化、revision fingerprint、上限付きの
immutableなpure mutationを管理する。backgroundはこのpure mutationをqueue経由で
`storage.local`へ反映する。

## storage(`src/lib/storage/`)

`pinStore` 1キーだけを`storage.local`に保存する。content側は
`useStorageValue('pinStore')`でbackground mutationの完了を追従する。
