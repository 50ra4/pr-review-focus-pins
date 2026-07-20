import { sendMessage } from './messages';

// コンパイル時の型契約テスト。`@ts-expect-error` の各行は「そこで型エラーが
// 起きること」を要求するため、契約が緩むと `npm run check-type` が落ちる。
// これらの関数は実行されない(型検査のみ)。

const _requestTypeChecks = () => {
  const scope = { owner: 'openai', repository: 'codex', pullNumber: 42 };

  // @ts-expect-error 存在しないメッセージ名は拒否される
  void sendMessage('unknown-message', { text: 'x' });

  void sendMessage('upsertPin', {
    scope,
    path: 'src/a.ts',
    // @ts-expect-error payload の reason が契約と一致しない
    reason: 'other',
    note: '',
    currentFingerprint: 'fingerprint',
  });

  // @ts-expect-error payload のプロパティ不足
  void sendMessage('upsertPin', { scope });

  // 正しい呼び出しは型エラーにならない
  void sendMessage('removePin', { scope, path: 'src/a.ts' });
};

const _responseTypeChecks = async () => {
  const res = await sendMessage('clearAllPins', {});

  // response は PinStoreV1。存在しないプロパティ参照は型エラー
  // @ts-expect-error
  void res.nonExistent;

  // 正しいプロパティ参照は型エラーにならない
  void res.scopes;
};

// 未使用シンボル警告を避けるため参照する(呼び出しはしない)
void _requestTypeChecks;
void _responseTypeChecks;

describe('lib/messaging types', () => {
  it('コンパイル時の型契約は check-type で検査される', () => {
    expect(typeof sendMessage).toBe('function');
  });
});
