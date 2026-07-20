import { createRoot, type Root as ReactRoot } from 'react-dom/client';
import { useEffect, useMemo, useRef, useState } from 'react';
import panelStyles from './focusPins.css?inline';
import rowButtonStyles from './githubRowButtons.css?inline';
import { FocusPinsPanel } from './FocusPinsPanel';
import {
  cleanupFileTree,
  extractFileTreeItems,
  injectPinButtons,
  parsePrFilesUrl,
  setPinOnlyMode,
  updatePinButtons,
  type FileTreeDiagnostics,
  type FileTreeItem,
} from './github/githubPrAdapter';
import { createRevisionFingerprint } from '../../lib/pins/fingerprint';
import { createScopeKey, isPinStoreV1 } from '../../lib/pins/guards';
import { getStalePins } from '../../lib/pins/pinStore';
import type { PinReason, PinStoreV1, PrScope } from '../../lib/pins/types';
import { sendMessage } from '../../lib/messaging/messages';
import { useStorageValue } from '../../lib/storage';

const HOST_ID = 'pr-review-focus-pins-host';
const ROW_STYLE_ID = 'pr-review-focus-pins-row-styles';
const NAVIGATION_EVENT = 'pr-focus-pins:navigation';
const GITHUB_NAVIGATION_EVENTS = [
  'turbo:load',
  'pjax:end',
  'soft-nav:end',
] as const;

type RootProps = { scope: PrScope };

const getScopeState = (store: PinStoreV1, scope: PrScope) =>
  store.scopes[createScopeKey(scope)];

const Root = ({ scope }: RootProps) => {
  const [storedValue] = useStorageValue('pinStore');
  const validStore = isPinStoreV1(storedValue);
  const store = validStore ? storedValue : null;
  const [items, setItems] = useState<FileTreeItem[]>([]);
  const [diagnostics, setDiagnostics] = useState<FileTreeDiagnostics>({
    treeFound: false,
    candidateCount: 0,
    skipped: [],
  });
  const [fingerprint, setFingerprint] = useState('');
  const [pinOnly, setPinOnly] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [jumpIndex, setJumpIndex] = useState(-1);
  const storeRef = useRef<PinStoreV1 | null>(store);
  const itemsRef = useRef<FileTreeItem[]>(items);

  useEffect(() => {
    storeRef.current = store;
  }, [store]);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const scopeState = store ? getScopeState(store, scope) : undefined;
  const pinnedPaths = useMemo(
    () => new Set(Object.keys(scopeState?.pins ?? {})),
    [scopeState],
  );
  const stalePaths = useMemo(
    () =>
      new Set(
        scopeState
          ? getStalePins(
              scopeState,
              items.map((item) => item.path),
            ).map((pin) => pin.path)
          : [],
      ),
    [items, scopeState],
  );
  const pins = useMemo(
    () =>
      Object.values(scopeState?.pins ?? {})
        .toSorted((left, right) => left.path.localeCompare(right.path))
        .map((pin) => ({ pin, stale: stalePaths.has(pin.path) })),
    [scopeState, stalePaths],
  );

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let active = true;
    const expectedScopeKey = createScopeKey(scope);

    const scan = async (): Promise<void> => {
      const extraction = extractFileTreeItems(document, scope);
      if (!active) return;
      setDiagnostics(extraction.diagnostics);
      setItems(extraction.items);
      itemsRef.current = extraction.items;

      const currentStore = storeRef.current;
      const currentScopeState = currentStore
        ? getScopeState(currentStore, scope)
        : undefined;
      injectPinButtons(
        extraction.items,
        new Set(Object.keys(currentScopeState?.pins ?? {})),
      );

      if (extraction.items.length === 0) return;
      const nextFingerprint = await createRevisionFingerprint(extraction.items);
      if (!active) return;
      setFingerprint(nextFingerprint);
      try {
        await sendMessage('syncPinScope', {
          scope,
          currentFingerprint: nextFingerprint,
          currentPaths: extraction.items.map((item) => item.path),
        });
        if (active) setError('');
      } catch (cause: unknown) {
        if (active) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      }
    };

    const scheduleScan = (): void => {
      const currentScope = parsePrFilesUrl(location.href);
      if (!currentScope || createScopeKey(currentScope) !== expectedScopeKey) {
        window.dispatchEvent(new Event(NAVIGATION_EVENT));
        return;
      }
      clearTimeout(timeout);
      timeout = setTimeout(() => void scan(), 100);
    };

    const observer = new MutationObserver(scheduleScan);
    observer.observe(document.body, { childList: true, subtree: true });
    void scan();

    return () => {
      active = false;
      clearTimeout(timeout);
      observer.disconnect();
      cleanupFileTree(itemsRef.current);
    };
  }, [scope]);

  useEffect(() => {
    injectPinButtons(items, pinnedPaths);
    updatePinButtons(items, pinnedPaths);
    setPinOnlyMode(items, pinnedPaths, pinOnly);
  }, [items, pinOnly, pinnedPaths]);

  useEffect(() => {
    const onPinButtonClick = (event: MouseEvent): void => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest<HTMLButtonElement>(
        '[data-pr-focus-pin-path]',
      );
      if (!button?.dataset.prFocusPinPath) return;
      event.preventDefault();
      event.stopPropagation();
      setSaveError('');
      setSelectedPath(button.dataset.prFocusPinPath);
    };
    document.addEventListener('click', onPinButtonClick);
    return () => document.removeEventListener('click', onPinButtonClick);
  }, []);

  const savePin = async (reason: PinReason, note: string): Promise<void> => {
    if (!selectedPath || !fingerprint) return;
    setIsSaving(true);
    setSaveError('');
    try {
      await sendMessage('upsertPin', {
        scope,
        path: selectedPath,
        reason,
        note,
        currentFingerprint: fingerprint,
      });
      setSelectedPath(null);
    } catch (cause: unknown) {
      setSaveError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setIsSaving(false);
    }
  };

  const remove = async (path: string): Promise<void> => {
    try {
      await sendMessage('removePin', { scope, path });
      if (selectedPath === path) setSelectedPath(null);
      setError('');
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const jumpTo = (path: string): void => {
    const item = items.find((candidate) => candidate.path === path);
    const target = item
      ? document.getElementById(item.diffAnchor.slice(1))
      : null;
    if (!target) {
      setError(`${path} is not present in the current file tree.`);
      return;
    }
    target.scrollIntoView({ block: 'start', behavior: 'smooth' });
    setError('');
  };

  const jumpRelative = (offset: number): void => {
    if (pins.length === 0) return;
    const nextIndex = (jumpIndex + offset + pins.length) % pins.length;
    setJumpIndex(nextIndex);
    jumpTo(pins[nextIndex].pin.path);
  };

  const clearScope = async (): Promise<void> => {
    if (!window.confirm('Delete all focus pins for this PR?')) return;
    try {
      await sendMessage('clearPinScope', { scope });
      setSelectedPath(null);
      setPinOnly(false);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const clearAll = async (): Promise<void> => {
    if (!window.confirm('Delete all focus pin data from this device?')) return;
    try {
      await sendMessage('clearAllPins', {});
      setSelectedPath(null);
      setPinOnly(false);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  return (
    <FocusPinsPanel
      changed={Boolean(
        scopeState?.previousFingerprint &&
        scopeState.previousFingerprint !== scopeState.observedFingerprint,
      )}
      collapsed={collapsed}
      error={validStore ? error : 'Stored data needs migration.'}
      isSaving={isSaving}
      onCancelEdit={() => setSelectedPath(null)}
      onClearAll={() => void clearAll()}
      onClearScope={() => void clearScope()}
      onEdit={setSelectedPath}
      onJump={jumpTo}
      onNext={() => jumpRelative(1)}
      onPrevious={() => jumpRelative(-1)}
      onRemove={(path) => void remove(path)}
      onSave={(reason, note) => void savePin(reason, note)}
      onToggleCollapsed={() => setCollapsed((value) => !value)}
      onTogglePinOnly={setPinOnly}
      pinOnly={pinOnly}
      pins={pins}
      saveError={saveError}
      scope={scope}
      selectedPath={selectedPath}
      uiNotRecognized={
        diagnostics.treeFound &&
        diagnostics.candidateCount > 0 &&
        items.length === 0
      }
    />
  );
};

let mounted:
  | {
      scopeKey: string;
      host: HTMLElement;
      root: ReactRoot;
      rowStyle: HTMLElement;
    }
  | undefined;

const unmount = (): void => {
  mounted?.root.unmount();
  mounted?.host.remove();
  mounted?.rowStyle.remove();
  mounted = undefined;
};

const reconcile = (): void => {
  const scope = parsePrFilesUrl(location.href);
  if (!scope) {
    unmount();
    return;
  }
  const scopeKey = createScopeKey(scope);
  if (mounted?.scopeKey === scopeKey) return;
  unmount();

  const host = document.createElement('div');
  host.id = HOST_ID;
  host.style.cssText =
    'position:fixed;right:16px;bottom:16px;z-index:1000;display:block;';
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = panelStyles;
  const container = document.createElement('div');
  shadow.append(style, container);
  document.body.append(host);

  const rowStyle = document.createElement('style');
  rowStyle.id = ROW_STYLE_ID;
  rowStyle.textContent = rowButtonStyles;
  document.head.append(rowStyle);

  const root = createRoot(container);
  root.render(<Root scope={scope} />);
  mounted = { scopeKey, host, root, rowStyle };
};

const start = (): void => {
  reconcile();
  window.addEventListener('popstate', reconcile);
  window.addEventListener('pageshow', reconcile);
  window.addEventListener(NAVIGATION_EVENT, reconcile);
  for (const eventName of GITHUB_NAVIGATION_EVENTS) {
    document.addEventListener(eventName, reconcile);
  }
};

try {
  start();
} catch (cause: unknown) {
  console.error('PR Review Focus Pins could not start.', cause);
}
