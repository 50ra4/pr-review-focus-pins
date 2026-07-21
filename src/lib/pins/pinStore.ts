import { countCodePoints, createScopeKey, normalizeFilePath } from './guards';
import type {
  ClearPinScopeRequest,
  FilePin,
  PinScopeState,
  PinStoreV1,
  RemovePinRequest,
  SyncPinScopeRequest,
  UpsertPinRequest,
} from './types';

export const PIN_LIMITS = {
  scopes: 100,
  totalPins: 500,
  pinsPerScope: 200,
  noteCodePoints: 200,
} as const;

const cloneStore = (store: PinStoreV1): PinStoreV1 => ({
  version: 1,
  scopes: Object.fromEntries(
    Object.entries(store.scopes).filter(
      ([, scopeState]) => Object.keys(scopeState.pins).length > 0,
    ),
  ),
});

const totalPins = (store: PinStoreV1): number =>
  Object.values(store.scopes).reduce(
    (count, scopeState) => count + Object.keys(scopeState.pins).length,
    0,
  );

const validateLimits = (store: PinStoreV1): void => {
  if (Object.keys(store.scopes).length > PIN_LIMITS.scopes) {
    throw new Error(`A maximum of ${PIN_LIMITS.scopes} PR scopes is allowed.`);
  }
  if (totalPins(store) > PIN_LIMITS.totalPins) {
    throw new Error(`A maximum of ${PIN_LIMITS.totalPins} pins is allowed.`);
  }
  for (const scopeState of Object.values(store.scopes)) {
    if (Object.keys(scopeState.pins).length > PIN_LIMITS.pinsPerScope) {
      throw new Error(
        `A maximum of ${PIN_LIMITS.pinsPerScope} pins per PR is allowed.`,
      );
    }
  }
};

const requirePath = (path: string): string => {
  const normalized = normalizeFilePath(path);
  if (normalized.length === 0) {
    throw new Error('A non-empty file path is required.');
  }
  return normalized;
};

export const syncPinScope = (
  store: PinStoreV1,
  request: SyncPinScopeRequest,
  now: string,
): PinStoreV1 => {
  if (request.currentFingerprint.length === 0) {
    throw new Error('A revision fingerprint is required.');
  }

  const key = createScopeKey(request.scope);
  const next = cloneStore(store);
  const existing = next.scopes[key];
  if (!existing) return next;
  const nextScope: PinScopeState = {
    ...existing,
    scope: request.scope,
    observedFingerprint: request.currentFingerprint,
    lastSeenAt: now,
    pins: { ...existing.pins },
    ...(existing.observedFingerprint !== request.currentFingerprint
      ? { previousFingerprint: existing.observedFingerprint }
      : {}),
  };

  next.scopes[key] = nextScope;
  validateLimits(next);
  return next;
};

export const upsertPin = (
  store: PinStoreV1,
  request: UpsertPinRequest,
  now: string,
): PinStoreV1 => {
  const path = requirePath(request.path);
  const note = request.note.trim();
  if (countCodePoints(note) > PIN_LIMITS.noteCodePoints) {
    throw new Error(
      `A pin note cannot exceed ${PIN_LIMITS.noteCodePoints} characters.`,
    );
  }
  if (request.currentFingerprint.length === 0) {
    throw new Error('A revision fingerprint is required.');
  }

  const key = createScopeKey(request.scope);
  const next = cloneStore(store);
  const existingScope = next.scopes[key];
  const existingPin = existingScope?.pins[path];
  const pin: FilePin = {
    path,
    reason: request.reason,
    note,
    createdAt: existingPin?.createdAt ?? now,
    updatedAt: now,
    lastSeenFingerprint: request.currentFingerprint,
  };
  const nextScope: PinScopeState = existingScope
    ? {
        ...existingScope,
        scope: request.scope,
        lastSeenAt: now,
        pins: { ...existingScope.pins, [path]: pin },
      }
    : {
        scope: request.scope,
        observedFingerprint: request.currentFingerprint,
        lastSeenAt: now,
        pins: { [path]: pin },
      };

  next.scopes[key] = nextScope;
  validateLimits(next);
  return next;
};

export const removePin = (
  store: PinStoreV1,
  request: RemovePinRequest,
): PinStoreV1 => {
  const key = createScopeKey(request.scope);
  const path = requirePath(request.path);
  const existingScope = store.scopes[key];
  if (!existingScope?.pins[path]) return store;

  const next = cloneStore(store);
  const pins = { ...existingScope.pins };
  delete pins[path];
  if (Object.keys(pins).length === 0) {
    delete next.scopes[key];
  } else {
    next.scopes[key] = { ...existingScope, pins };
  }
  return next;
};

export const clearPinScope = (
  store: PinStoreV1,
  request: ClearPinScopeRequest,
): PinStoreV1 => {
  const key = createScopeKey(request.scope);
  if (!store.scopes[key]) return store;
  const next = cloneStore(store);
  delete next.scopes[key];
  return next;
};

export const clearAllPins = (_store: PinStoreV1): PinStoreV1 => ({
  version: 1,
  scopes: {},
});

export const getStalePins = (
  scopeState: PinScopeState,
  currentPaths: readonly string[],
): FilePin[] => {
  const current = new Set(currentPaths.map(normalizeFilePath));
  return Object.values(scopeState.pins).filter((pin) => !current.has(pin.path));
};
