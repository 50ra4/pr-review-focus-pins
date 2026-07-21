import { addMessageListeners } from '../../lib/messaging/messages';
import { isPinStoreV1 } from '../../lib/pins/guards';
import {
  acknowledgePinScope,
  clearAllPins,
  clearPinScope,
  removePin,
  syncPinScope,
  upsertPin,
} from '../../lib/pins/pinStore';
import type { PinStoreV1 } from '../../lib/pins/types';
import { getStorageValue, setStorageValue } from '../../lib/storage';

let mutationQueue: Promise<void> = Promise.resolve();

export const enqueueMutation = <Result>(
  task: () => Promise<Result>,
): Promise<Result> => {
  const result = mutationQueue.then(task, task);
  mutationQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
};

const mutateStore = (
  mutation: (store: PinStoreV1) => PinStoreV1,
): Promise<PinStoreV1> =>
  enqueueMutation(async () => {
    const stored: unknown = await getStorageValue('pinStore');
    if (!isPinStoreV1(stored)) {
      throw new Error('Stored data needs migration.');
    }
    const next = mutation(stored);
    await setStorageValue('pinStore', next);
    return next;
  });

addMessageListeners({
  acknowledgePinScope: (payload) =>
    mutateStore((store) =>
      acknowledgePinScope(store, payload, new Date().toISOString()),
    ),
  upsertPin: (payload) =>
    mutateStore((store) => upsertPin(store, payload, new Date().toISOString())),
  removePin: (payload) => mutateStore((store) => removePin(store, payload)),
  syncPinScope: (payload) =>
    mutateStore((store) =>
      syncPinScope(store, payload, new Date().toISOString()),
    ),
  clearPinScope: (payload) =>
    mutateStore((store) => clearPinScope(store, payload)),
  clearAllPins: () => mutateStore(clearAllPins),
});
