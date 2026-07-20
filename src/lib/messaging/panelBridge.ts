import { isRecord, normalizeFilePath } from '../pins/guards';

export type PanelSnapshot = {
  type: 'snapshot';
  colorMode: string;
  currentFingerprint: string;
  currentPaths: string[];
  error: string;
  uiNotRecognized: boolean;
};

export type ContentToPanelMessage =
  PanelSnapshot | { type: 'selectPath'; path: string };

export type PanelToContentMessage =
  | { type: 'ready' }
  | { type: 'setCollapsed'; collapsed: boolean }
  | { type: 'setPinOnly'; enabled: boolean }
  | { type: 'jump'; path: string };

const hasPath = (value: unknown): value is string =>
  typeof value === 'string' && normalizeFilePath(value).length > 0;

export const isContentToPanelMessage = (
  value: unknown,
): value is ContentToPanelMessage => {
  if (!isRecord(value) || typeof value.type !== 'string') return false;
  if (value.type === 'selectPath') return hasPath(value.path);
  return (
    value.type === 'snapshot' &&
    typeof value.colorMode === 'string' &&
    typeof value.currentFingerprint === 'string' &&
    Array.isArray(value.currentPaths) &&
    value.currentPaths.every(hasPath) &&
    typeof value.error === 'string' &&
    typeof value.uiNotRecognized === 'boolean'
  );
};

export const isPanelToContentMessage = (
  value: unknown,
): value is PanelToContentMessage => {
  if (!isRecord(value) || typeof value.type !== 'string') return false;
  if (value.type === 'ready') return true;
  if (value.type === 'setCollapsed') {
    return typeof value.collapsed === 'boolean';
  }
  if (value.type === 'setPinOnly') return typeof value.enabled === 'boolean';
  return value.type === 'jump' && hasPath(value.path);
};
