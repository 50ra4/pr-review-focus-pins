const MINIMUM_STABILITY_MS = 2_000;
const PER_FILE_STABILITY_MS = 20;
const MAXIMUM_STABILITY_MS = 5_000;

const getStabilityDelay = (itemCount: number): number =>
  Math.min(
    MINIMUM_STABILITY_MS + itemCount * PER_FILE_STABILITY_MS,
    MAXIMUM_STABILITY_MS,
  );

export type FileTreeStability = {
  cancel: () => void;
  observe: (signature: string, itemCount: number) => boolean;
};

export const createFileTreeStability = (
  onStable: () => void,
): FileTreeStability => {
  let stableSignature = '';
  let pendingSignature = '';
  let timeout: ReturnType<typeof setTimeout> | undefined;

  const cancel = (): void => {
    clearTimeout(timeout);
    timeout = undefined;
    pendingSignature = '';
    stableSignature = '';
  };

  const observe = (signature: string, itemCount: number): boolean => {
    if (signature === stableSignature) return true;
    if (signature === pendingSignature) return false;

    clearTimeout(timeout);
    stableSignature = '';
    pendingSignature = signature;
    timeout = setTimeout(() => {
      stableSignature = signature;
      pendingSignature = '';
      timeout = undefined;
      onStable();
    }, getStabilityDelay(itemCount));
    return false;
  };

  return { cancel, observe };
};
