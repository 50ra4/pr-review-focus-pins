export type PinReason = 'revisit' | 'question' | 'test' | 'risk' | 'custom';

export type PrScope = {
  owner: string;
  repository: string;
  pullNumber: number;
};

export type FilePin = {
  path: string;
  reason: PinReason;
  note: string;
  createdAt: string;
  updatedAt: string;
  lastSeenFingerprint: string;
};

export type PinScopeState = {
  scope: PrScope;
  observedFingerprint: string;
  previousFingerprint?: string;
  lastSeenAt: string;
  pins: Record<string, FilePin>;
};

export type PinStoreV1 = {
  version: 1;
  scopes: Record<string, PinScopeState>;
};

export type UpsertPinRequest = {
  scope: PrScope;
  path: string;
  reason: PinReason;
  note: string;
  currentFingerprint: string;
};

export type RemovePinRequest = {
  scope: PrScope;
  path: string;
};

export type AcknowledgePinScopeRequest = {
  scope: PrScope;
  currentFingerprint: string;
};

export type SyncPinScopeRequest = {
  scope: PrScope;
  currentFingerprint: string;
  currentPaths: string[];
};

export type ClearPinScopeRequest = {
  scope: PrScope;
};
