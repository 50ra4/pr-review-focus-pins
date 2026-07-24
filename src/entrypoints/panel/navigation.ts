export const getRelativePath = (
  paths: readonly string[],
  currentPath: string | null,
  offset: number,
): string | null => {
  if (paths.length === 0) return null;
  const currentIndex = currentPath === null ? -1 : paths.indexOf(currentPath);
  if (currentIndex === -1) {
    return paths[offset < 0 ? paths.length - 1 : 0];
  }
  return paths[(currentIndex + offset + paths.length) % paths.length];
};
