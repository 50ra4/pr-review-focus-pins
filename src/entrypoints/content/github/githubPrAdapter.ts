import { isRecord, normalizeFilePath } from '../../../lib/pins/guards';
import type { PrScope } from '../../../lib/pins/types';

const PR_FILES_URL =
  /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)\/files(?:[/?#]|$)/u;
const DIFF_ANCHOR = /^#diff-[a-z0-9_-]+$/iu;
const COMMIT_SHA = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/iu;
const TREE_SELECTORS = [
  '[role="tree"][aria-label="File Tree"]',
  '[data-testid="file-tree"]',
  '[data-file-tree]',
  '[aria-label="File tree"]',
  '.js-file-tree',
] as const;
const ROW_SELECTOR =
  '[data-file-tree-item], [data-tree-entry-type="file"], [role="treeitem"], li';
const REVISION_SELECTORS = [
  '[data-head-oid]',
  '[data-url*="end_commit_oid="]',
  'details-menu[src*="sha2="]',
] as const;

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
  complete: boolean;
  expectedFileCount: number | null;
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

const containsFileTree = (node: Node): boolean => {
  if (!(node instanceof Element)) return false;
  return TREE_SELECTORS.some(
    (selector) =>
      node.matches(selector) || node.querySelector(selector) !== null,
  );
};

const containsRevisionRoot = (node: Node): boolean => {
  if (!(node instanceof Element)) return false;
  return REVISION_SELECTORS.some(
    (selector) =>
      node.matches(selector) || node.querySelector(selector) !== null,
  );
};

const isRevisionAttributeMutation = (mutation: MutationRecord): boolean => {
  if (mutation.type !== 'attributes' || !(mutation.target instanceof Element)) {
    return false;
  }
  const current = mutation.attributeName
    ? mutation.target.getAttribute(mutation.attributeName)
    : null;
  switch (mutation.attributeName) {
    case 'data-head-oid':
      return (
        (current !== null && COMMIT_SHA.test(current)) ||
        (mutation.oldValue !== null && COMMIT_SHA.test(mutation.oldValue))
      );
    case 'data-url':
      return (
        current?.includes('end_commit_oid=') === true ||
        mutation.oldValue?.includes('end_commit_oid=') === true
      );
    case 'src':
      return (
        mutation.target.localName === 'details-menu' &&
        (current?.includes('sha2=') === true ||
          mutation.oldValue?.includes('sha2=') === true)
      );
    default:
      return false;
  }
};

export const hasFileTreeMutation = (
  mutations: readonly MutationRecord[],
  root: ParentNode,
): boolean => {
  const tree = findTreeRoot(root);
  return mutations.some((mutation) => {
    if (mutation.type !== 'childList') return false;
    if (tree && (mutation.target === tree || tree.contains(mutation.target))) {
      return true;
    }
    return [...mutation.addedNodes, ...mutation.removedNodes].some(
      containsFileTree,
    );
  });
};

export const hasPrHeadMutation = (
  mutations: readonly MutationRecord[],
): boolean => {
  return mutations.some((mutation) => {
    if (mutation.type === 'attributes') {
      return isRevisionAttributeMutation(mutation);
    }
    if (mutation.type !== 'childList') return false;
    return [...mutation.addedNodes, ...mutation.removedNodes].some(
      containsRevisionRoot,
    );
  });
};

export type RevisionSource = 'head-oid' | 'end-commit-oid' | 'toc-sha2';

export type RevisionSourceDiagnostics = {
  source: RevisionSource;
  candidateCount: number;
  validCount: number;
  invalidCount: number;
  outOfScopeCount: number;
  uniqueCommitCount: number;
};

export type RevisionDiagnostics = {
  selectedSource: RevisionSource | null;
  sources: readonly RevisionSourceDiagnostics[];
};

export type PrRevisionExtraction = {
  commit: string | null;
  diagnostics: RevisionDiagnostics;
};

type RevisionSourceAnalysis = {
  commits: Set<string>;
  diagnostics: RevisionSourceDiagnostics;
};

type CommitCandidate =
  { commit: string } | { rejection: 'invalid' | 'out-of-scope' };

const isScopedPrUrl = (value: string, scope: PrScope): boolean => {
  try {
    const parsed = new URL(value, 'https://github.com');
    const expectedPath =
      `/${scope.owner}/${scope.repository}/pull/${scope.pullNumber}`.toLowerCase();
    const pathname = parsed.pathname.toLowerCase();
    return (
      parsed.origin === 'https://github.com' &&
      (pathname === expectedPath || pathname.startsWith(`${expectedPath}/`))
    );
  } catch {
    return false;
  }
};

const hasScopedRevisionContext = (
  element: Element,
  scope: PrScope,
): boolean => {
  const attributes = ['action', 'data-url', 'href', 'src'] as const;
  let current: Element | null = element;
  while (current) {
    for (const attribute of attributes) {
      const value = current.getAttribute(attribute);
      if (value && isScopedPrUrl(value, scope)) return true;
    }
    current = current.parentElement;
  }
  return false;
};

const readScopedQueryCommit = (
  value: string,
  parameter: string,
  scope: PrScope,
): CommitCandidate => {
  try {
    const parsed = new URL(value, 'https://github.com');
    if (!isScopedPrUrl(parsed.href, scope)) {
      return { rejection: 'out-of-scope' };
    }
    const commit = parsed.searchParams.get(parameter);
    return commit && COMMIT_SHA.test(commit)
      ? { commit: commit.toLowerCase() }
      : { rejection: 'invalid' };
  } catch {
    return { rejection: 'invalid' };
  }
};

const createAnalysis = (
  source: RevisionSource,
  candidateCount: number,
  validCount: number,
  invalidCount: number,
  outOfScopeCount: number,
  commits: Set<string>,
): RevisionSourceAnalysis => ({
  commits,
  diagnostics: {
    source,
    candidateCount,
    validCount,
    invalidCount,
    outOfScopeCount,
    uniqueCommitCount: commits.size,
  },
});

const analyzeHeadOids = (
  root: ParentNode,
  scope: PrScope,
): RevisionSourceAnalysis => {
  const elements = [...root.querySelectorAll<HTMLElement>('[data-head-oid]')];
  const commits = new Set<string>();
  let validCount = 0;
  let invalidCount = 0;
  let outOfScopeCount = 0;
  for (const element of elements) {
    const value = element.dataset.headOid;
    if (!value || !COMMIT_SHA.test(value)) {
      invalidCount += 1;
    } else if (!hasScopedRevisionContext(element, scope)) {
      outOfScopeCount += 1;
    } else {
      validCount += 1;
      commits.add(value.toLowerCase());
    }
  }
  return createAnalysis(
    'head-oid',
    elements.length,
    validCount,
    invalidCount,
    outOfScopeCount,
    commits,
  );
};

const analyzeScopedQueryCommits = (
  source: RevisionSource,
  elements: Iterable<Element>,
  attribute: string,
  parameter: string,
  scope: PrScope,
): RevisionSourceAnalysis => {
  let candidateCount = 0;
  let validCount = 0;
  let invalidCount = 0;
  let outOfScopeCount = 0;
  const commits = new Set<string>();
  for (const element of elements) {
    candidateCount += 1;
    const value = element.getAttribute(attribute);
    if (!value) {
      invalidCount += 1;
      continue;
    }
    const candidate = readScopedQueryCommit(value, parameter, scope);
    if ('commit' in candidate) {
      validCount += 1;
      commits.add(candidate.commit);
    } else if (candidate.rejection === 'out-of-scope') {
      outOfScopeCount += 1;
    } else {
      invalidCount += 1;
    }
  }
  return createAnalysis(
    source,
    candidateCount,
    validCount,
    invalidCount,
    outOfScopeCount,
    commits,
  );
};

const getRevisionSourceStatus = (
  diagnostics: RevisionSourceDiagnostics,
): string => {
  if (diagnostics.candidateCount === 0) return 'missing';
  if (diagnostics.validCount === 0) {
    if (diagnostics.outOfScopeCount > 0 && diagnostics.invalidCount === 0) {
      return 'out-of-scope';
    }
    if (diagnostics.invalidCount > 0 && diagnostics.outOfScopeCount === 0) {
      return 'invalid';
    }
    return 'invalid/out-of-scope';
  }
  return diagnostics.uniqueCommitCount > 1 ? 'ambiguous' : 'unresolved';
};

export const describeRevisionFailure = (
  diagnostics: RevisionDiagnostics,
): string => {
  const details = diagnostics.sources
    .map(
      (source) =>
        `${source.source}: ${getRevisionSourceStatus(source)} ` +
        `(${source.candidateCount} candidates, ${source.validCount} valid, ` +
        `${source.uniqueCommitCount} unique)`,
    )
    .join('; ');
  return `GitHub PR revision could not be identified (${details}).`;
};

export const extractPrRevision = (
  root: ParentNode,
  scope: PrScope,
): PrRevisionExtraction => {
  const analyses = [
    analyzeHeadOids(root, scope),
    analyzeScopedQueryCommits(
      'end-commit-oid',
      root.querySelectorAll('[data-url*="end_commit_oid="]'),
      'data-url',
      'end_commit_oid',
      scope,
    ),
    analyzeScopedQueryCommits(
      'toc-sha2',
      root.querySelectorAll('details-menu[src*="sha2="]'),
      'src',
      'sha2',
      scope,
    ),
  ];
  const selected = analyses.find(({ commits }) => commits.size === 1);
  return {
    commit: selected ? [...selected.commits][0] : null,
    diagnostics: {
      selectedSource: selected?.diagnostics.source ?? null,
      sources: analyses.map(({ diagnostics }) => diagnostics),
    },
  };
};

export const extractPrHeadCommit = (
  root: ParentNode,
  scope: PrScope,
): string | null => {
  return extractPrRevision(root, scope).commit;
};

const readFileCount = (element: Element): number | null => {
  const encoded = element.getAttribute('data-hydro-click-payload');
  if (!encoded) return null;
  try {
    const value: unknown = JSON.parse(encoded);
    if (!isRecord(value) || !isRecord(value.payload)) return null;
    const { payload } = value;
    if (payload.category !== 'file_tree' || !isRecord(payload.data)) {
      return null;
    }
    const count = payload.data.file_count;
    return typeof count === 'number' && Number.isSafeInteger(count) && count > 0
      ? count
      : null;
  } catch {
    return null;
  }
};

const getExpectedFileCount = (tree: Element): number | null => {
  const ownCount = readFileCount(tree);
  if (ownCount !== null) return ownCount;
  for (const element of tree.querySelectorAll('[data-hydro-click-payload]')) {
    const count = readFileCount(element);
    if (count !== null) return count;
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
    complete: false,
    expectedFileCount: tree ? getExpectedFileCount(tree) : null,
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

  diagnostics.complete = diagnostics.expectedFileCount === items.length;
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
  const tooltipText = isPinned ? 'Edit focus pin' : 'Add focus pin';
  if (tooltip && tooltip.textContent !== tooltipText) {
    tooltip.textContent = tooltipText;
  }
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
