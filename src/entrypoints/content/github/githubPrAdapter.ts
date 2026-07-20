import { normalizeFilePath } from '../../../lib/pins/guards';
import type { PrScope } from '../../../lib/pins/types';

const PR_FILES_URL =
  /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)\/files(?:[/?#]|$)/u;
const DIFF_ANCHOR = /^#diff-[a-z0-9_-]+$/iu;
const TREE_SELECTORS = [
  '[role="tree"][aria-label="File Tree"]',
  '[data-testid="file-tree"]',
  '[data-file-tree]',
  '[aria-label="File tree"]',
  '.js-file-tree',
] as const;
const ROW_SELECTOR =
  '[data-file-tree-item], [data-tree-entry-type="file"], [role="treeitem"], li';

export const PIN_BUTTON_ATTRIBUTE = 'data-pr-focus-pin-path';
export const HIDDEN_ROW_CLASS = 'pr-focus-pins__hidden-row';

export type FileTreeItem = {
  path: string;
  diffAnchor: string;
  rowElement: HTMLElement;
  anchorElement: HTMLAnchorElement;
};

export type SkippedFileTreeItem = {
  reason: 'missing-path' | 'duplicate-path' | 'missing-diff-anchor';
  detail: string;
};

export type FileTreeDiagnostics = {
  treeFound: boolean;
  candidateCount: number;
  skipped: SkippedFileTreeItem[];
};

export type FileTreeExtraction = {
  items: FileTreeItem[];
  diagnostics: FileTreeDiagnostics;
};

export const parsePrFilesUrl = (url: string): PrScope | null => {
  const match = PR_FILES_URL.exec(url);
  if (!match) return null;
  const pullNumber = Number(match[3]);
  if (!Number.isSafeInteger(pullNumber) || pullNumber <= 0) return null;
  return { owner: match[1], repository: match[2], pullNumber };
};

const findTreeRoot = (root: ParentNode): Element | null => {
  for (const selector of TREE_SELECTORS) {
    const element = root.querySelector(selector);
    if (element) return element;
  }
  return null;
};

const getPathCandidate = (
  row: HTMLElement,
  anchor: HTMLAnchorElement,
): string => {
  const filterText = row.querySelector<HTMLElement>(
    '[data-filterable-item-text]',
  )?.textContent;
  const values = [
    row.dataset.path,
    filterText,
    anchor.title,
    anchor.getAttribute('aria-label'),
    anchor.textContent,
  ];

  for (const value of values) {
    if (!value) continue;
    const normalized = normalizeFilePath(value.replace(/[\u200e\u200f]/gu, ''));
    if (normalized.length > 0) return normalized;
  }
  return '';
};

const belongsToScope = (anchor: HTMLAnchorElement, scope: PrScope): boolean => {
  const href = anchor.getAttribute('href') ?? '';
  if (href.startsWith('#')) return true;
  try {
    const parsed = new URL(href, 'https://github.com');
    const expected = `/${scope.owner}/${scope.repository}/pull/${scope.pullNumber}/files`;
    return parsed.pathname.toLowerCase() === expected.toLowerCase();
  } catch {
    return false;
  }
};

export const extractFileTreeItems = (
  root: ParentNode,
  scope: PrScope,
): FileTreeExtraction => {
  const tree = findTreeRoot(root);
  const diagnostics: FileTreeDiagnostics = {
    treeFound: tree !== null,
    candidateCount: 0,
    skipped: [],
  };
  if (!tree) return { items: [], diagnostics };

  const items: FileTreeItem[] = [];
  const paths = new Set<string>();
  const rows = new Set<HTMLElement>();

  for (const anchor of tree.querySelectorAll<HTMLAnchorElement>('a')) {
    const row = anchor.closest<HTMLElement>(ROW_SELECTOR);
    if (!row || rows.has(row) || !belongsToScope(anchor, scope)) continue;
    rows.add(row);
    diagnostics.candidateCount += 1;

    const path = getPathCandidate(row, anchor);
    if (path.length === 0) {
      diagnostics.skipped.push({ reason: 'missing-path', detail: anchor.href });
      continue;
    }
    if (paths.has(path)) {
      diagnostics.skipped.push({ reason: 'duplicate-path', detail: path });
      continue;
    }
    if (!DIFF_ANCHOR.test(anchor.hash)) {
      diagnostics.skipped.push({ reason: 'missing-diff-anchor', detail: path });
      continue;
    }

    paths.add(path);
    items.push({
      path,
      diffAnchor: anchor.hash,
      rowElement: row,
      anchorElement: anchor,
    });
  }

  return { items, diagnostics };
};

const createPinIcon = (documentNode: Document): SVGElement => {
  const svg = documentNode.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  const path = documentNode.createElementNS(
    'http://www.w3.org/2000/svg',
    'path',
  );
  path.setAttribute(
    'd',
    'M4.5 1.5a1 1 0 0 1 1-1h5a1 1 0 0 1 .8 1.6L10 4v3l1.7 1.7a1 1 0 0 1-.7 1.7H8.7v4.1a.7.7 0 1 1-1.4 0v-4.1H5a1 1 0 0 1-.7-1.7L6 7V4L4.7 2.1a1 1 0 0 1-.2-.6Z',
  );
  svg.append(path);
  return svg;
};

const getExistingButton = (item: FileTreeItem): HTMLButtonElement | null => {
  for (const button of item.rowElement.querySelectorAll<HTMLButtonElement>(
    `[${PIN_BUTTON_ATTRIBUTE}]`,
  )) {
    if (button.dataset.prFocusPinPath === item.path) return button;
  }
  return null;
};

const updateButton = (
  button: HTMLButtonElement,
  path: string,
  isPinned: boolean,
): void => {
  button.setAttribute('aria-pressed', String(isPinned));
  button.setAttribute(
    'aria-label',
    `${isPinned ? 'Edit' : 'Pin'} ${path} for focused review`,
  );
  const tooltip = button.querySelector<HTMLElement>(
    '.pr-focus-pins__row-tooltip',
  );
  if (tooltip)
    tooltip.textContent = isPinned ? 'Edit focus pin' : 'Add focus pin';
};

export const injectPinButtons = (
  items: readonly FileTreeItem[],
  pinnedPaths: ReadonlySet<string>,
): number => {
  let injected = 0;
  for (const item of items) {
    const existing = getExistingButton(item);
    if (existing) {
      updateButton(existing, item.path, pinnedPaths.has(item.path));
      continue;
    }

    const button = item.rowElement.ownerDocument.createElement('button');
    button.type = 'button';
    button.className = 'pr-focus-pins__row-button';
    button.dataset.prFocusPinPath = item.path;
    button.append(createPinIcon(item.rowElement.ownerDocument));
    const tooltip = item.rowElement.ownerDocument.createElement('span');
    tooltip.className = 'pr-focus-pins__row-tooltip';
    tooltip.setAttribute('role', 'tooltip');
    button.append(tooltip);
    updateButton(button, item.path, pinnedPaths.has(item.path));
    item.rowElement.append(button);
    injected += 1;
  }
  return injected;
};

export const updatePinButtons = (
  items: readonly FileTreeItem[],
  pinnedPaths: ReadonlySet<string>,
): void => {
  for (const item of items) {
    const button = getExistingButton(item);
    if (button) updateButton(button, item.path, pinnedPaths.has(item.path));
  }
};

export const setPinOnlyMode = (
  items: readonly FileTreeItem[],
  pinnedPaths: ReadonlySet<string>,
  enabled: boolean,
): void => {
  for (const item of items) {
    item.rowElement.classList.toggle(
      HIDDEN_ROW_CLASS,
      enabled && !pinnedPaths.has(item.path),
    );
  }
};

export const cleanupFileTree = (items: readonly FileTreeItem[]): void => {
  for (const item of items) {
    item.rowElement.classList.remove(HIDDEN_ROW_CLASS);
    getExistingButton(item)?.remove();
  }
};
