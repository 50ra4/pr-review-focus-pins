export const REVISION_STABILITY_DELAY_MS = 1_000;

export type StableRevisionCandidate = {
  currentFingerprint: string;
  currentPaths: string[];
};

type StableRevisionScheduler = {
  cancel: () => void;
  schedule: (candidate: StableRevisionCandidate) => void;
};

export const createStableRevisionScheduler = (
  synchronize: (
    candidate: StableRevisionCandidate,
  ) => void | Promise<void>,
): StableRevisionScheduler => {
  let pendingFingerprint: string | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;

  const cancel = (): void => {
    clearTimeout(timeout);
    timeout = undefined;
    pendingFingerprint = undefined;
  };

  const schedule = (candidate: StableRevisionCandidate): void => {
    if (timeout && pendingFingerprint === candidate.currentFingerprint) return;
    cancel();
    pendingFingerprint = candidate.currentFingerprint;
    timeout = setTimeout(() => {
      timeout = undefined;
      pendingFingerprint = undefined;
      void synchronize(candidate);
    }, REVISION_STABILITY_DELAY_MS);
  };

  return { cancel, schedule };
};
