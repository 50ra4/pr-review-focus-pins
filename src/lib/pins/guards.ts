import type {
  FilePin,
  PinReason,
  PinScopeState,
  PinStoreV1,
  PrScope,
} from './types';

const PIN_REASONS = new Set<PinReason>([
  'revisit',
  'question',
  'test',
  'risk',
  'custom',
]);

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const isPinReason = (value: unknown): value is PinReason =>
  typeof value === 'string' && PIN_REASONS.has(value as PinReason);

export const countCodePoints = (value: string): number => [...value].length;

export const normalizeFilePath = (path: string): string =>
  path
    .trim()
    .replace(/^\/+|\/+$/gu, '')
    .replace(/\/{2,}/gu, '/');

export const isPrScope = (value: unknown): value is PrScope =>
  isRecord(value) &&
  typeof value.owner === 'string' &&
  value.owner.trim().length > 0 &&
  typeof value.repository === 'string' &&
  value.repository.trim().length > 0 &&
  typeof value.pullNumber === 'number' &&
  Number.isSafeInteger(value.pullNumber) &&
  value.pullNumber > 0;

export const createScopeKey = (scope: PrScope): string =>
  `${scope.owner.trim().toLowerCase()}/${scope.repository.trim().toLowerCase()}#${scope.pullNumber}`;

const isFilePin = (value: unknown): value is FilePin =>
  isRecord(value) &&
  typeof value.path === 'string' &&
  normalizeFilePath(value.path).length > 0 &&
  isPinReason(value.reason) &&
  typeof value.note === 'string' &&
  typeof value.createdAt === 'string' &&
  typeof value.updatedAt === 'string' &&
  typeof value.lastSeenFingerprint === 'string';

const isPinScopeState = (value: unknown): value is PinScopeState =>
  isRecord(value) &&
  isPrScope(value.scope) &&
  typeof value.observedFingerprint === 'string' &&
  (value.previousFingerprint === undefined ||
    typeof value.previousFingerprint === 'string') &&
  typeof value.lastSeenAt === 'string' &&
  isRecord(value.pins) &&
  Object.values(value.pins).every(isFilePin);

export const isPinStoreV1 = (value: unknown): value is PinStoreV1 =>
  isRecord(value) &&
  value.version === 1 &&
  isRecord(value.scopes) &&
  Object.values(value.scopes).every(isPinScopeState);
