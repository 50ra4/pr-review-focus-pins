// アプリのメッセージ契約。新しいメッセージはここに1件追加するだけで、
// 送信側・受信側の両方で型が保証される。ガードは手書きの型述語で十分
// (zod 等のランタイム依存は入れない)。
import { createMessaging, defineMessage } from './createMessaging';
import {
  countCodePoints,
  isPinReason,
  isPinStoreV1,
  isPrScope,
  isRecord,
  normalizeFilePath,
} from '../pins/guards';
import { PIN_LIMITS } from '../pins/pinStore';
import type {
  ClearPinScopeRequest,
  RemovePinRequest,
  SyncPinScopeRequest,
  UpsertPinRequest,
} from '../pins/types';

const hasValidPath = (value: unknown): value is string =>
  typeof value === 'string' && normalizeFilePath(value).length > 0;

const isUpsertPinRequest = (value: unknown): value is UpsertPinRequest =>
  isRecord(value) &&
  isPrScope(value.scope) &&
  hasValidPath(value.path) &&
  isPinReason(value.reason) &&
  typeof value.note === 'string' &&
  countCodePoints(value.note.trim()) <= PIN_LIMITS.noteCodePoints &&
  typeof value.currentFingerprint === 'string' &&
  value.currentFingerprint.length > 0;

const isRemovePinRequest = (value: unknown): value is RemovePinRequest =>
  isRecord(value) && isPrScope(value.scope) && hasValidPath(value.path);

const isSyncPinScopeRequest = (value: unknown): value is SyncPinScopeRequest =>
  isRecord(value) &&
  isPrScope(value.scope) &&
  typeof value.currentFingerprint === 'string' &&
  value.currentFingerprint.length > 0 &&
  Array.isArray(value.currentPaths) &&
  value.currentPaths.every(hasValidPath);

const isClearPinScopeRequest = (
  value: unknown,
): value is ClearPinScopeRequest => isRecord(value) && isPrScope(value.scope);

const isEmptyRequest = (value: unknown): value is Record<string, never> =>
  isRecord(value) && Object.keys(value).length === 0;

export const messages = {
  upsertPin: defineMessage(isUpsertPinRequest, isPinStoreV1),
  removePin: defineMessage(isRemovePinRequest, isPinStoreV1),
  syncPinScope: defineMessage(isSyncPinScopeRequest, isPinStoreV1),
  clearPinScope: defineMessage(isClearPinScopeRequest, isPinStoreV1),
  clearAllPins: defineMessage(isEmptyRequest, isPinStoreV1),
} as const;

export const { sendMessage, addMessageListeners } = createMessaging(messages);
