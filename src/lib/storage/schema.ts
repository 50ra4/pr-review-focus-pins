import type { PinStoreV1 } from '../pins/types';

type AppStorageValues = {
  pinStore: PinStoreV1;
};

export const storageSchema = {
  pinStore: {
    area: 'local',
    defaultValue: { version: 1, scopes: {} },
  },
} as const satisfies {
  [Key in keyof AppStorageValues]: {
    area: chrome.storage.AreaName;
    defaultValue: AppStorageValues[Key];
  };
};

export type StorageSchema = typeof storageSchema;
export type StorageKey = keyof StorageSchema;
export type StorageValue<Key extends StorageKey> = AppStorageValues[Key];
export type StorageAreaName<Key extends StorageKey> =
  StorageSchema[Key]['area'];
