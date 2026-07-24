export type FingerprintItem = {
  path: string;
  diffAnchor: string;
};

const serializeItems = (items: readonly FingerprintItem[]): string =>
  items
    .map(({ path, diffAnchor }) => `${path}\t${diffAnchor}\n`)
    .toSorted()
    .join('');

export const createFileTreeSignature = (
  items: readonly FingerprintItem[],
  revisionIdentity: string,
): string => `revision\t${revisionIdentity}\n${serializeItems(items)}`;

export const createRevisionFingerprint = async (
  items: readonly FingerprintItem[],
  revisionIdentity: string,
  expectedFileCount: number | null = null,
): Promise<string> => {
  const input =
    expectedFileCount === null
      ? createFileTreeSignature(items, revisionIdentity)
      : `revision\t${revisionIdentity}\nfile-count\t${expectedFileCount}\n`;
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(input),
  );

  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};
