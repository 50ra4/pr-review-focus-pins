export type FingerprintItem = {
  path: string;
  diffAnchor: string;
};

export const createRevisionFingerprint = async (
  items: readonly FingerprintItem[],
  revisionIdentity: string,
): Promise<string> => {
  const input = [
    `revision\t${revisionIdentity}\n`,
    ...items
      .map(({ path, diffAnchor }) => `${path}\t${diffAnchor}\n`)
      .toSorted(),
  ].join('');
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(input),
  );

  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};
