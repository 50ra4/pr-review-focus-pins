export const isCurrentScanResult = (
  active: boolean,
  sequence: number,
  currentSequence: number,
): boolean => active && sequence === currentSequence;
