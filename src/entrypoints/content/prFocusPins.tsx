import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot, type Root as ReactRoot } from 'react-dom/client';
import rowButtonStyles from './githubRowButtons.css?inline';
import { createFileTreeStability } from './fileTreeStability';
import {
  cleanupFileTree,
  extractFileTreeItems,
  hasFileTreeMutation,
  injectPinButtons,
  parsePrFilesUrl,
  setPinOnlyMode,
  updatePinButtons,
  type FileTreeDiagnostics,
  type FileTreeItem,
} from './github/githubPrAdapter';
import {
  isPanelToContentMessage,
  type ContentToPanelMessage,
  type PanelSnapshot,
} from '../../lib/messaging/panelBridge';
import { sendMessage } from '../../lib/messaging/messages';
import { createRevisionFingerprint } from '../../lib/pins/fingerprint';
import { createScopeKey, isPinStoreV1 } from '../../lib/pins/guards';
import type { PinStoreV1, PrScope } from '../../lib/pins/types';
import { getExtensionUrl } from '../../lib/runtime/getExtensionUrl';
import { useStorageValue } from '../../lib/storage';

const CONTROLLER_ID = 'pr-review-focus-pins-controller';
const PANEL_ID = 'pr-review-focus-pins-panel';
const ROW_STYLE_ID = 'pr-review-focus-pins-row-styles';
const NAVIGATION_EVENT = 'pr-focus-pins:navigation';
const GITHUB_NAVIGATION_EVENTS = [
  'turbo:load',
  'pjax:end',
  'soft-nav:end',
] as const;

type RootProps = {
  panel: HTMLIFrameElement;
  panelOrigin: string;
  scope: PrScope;
};

const EMPTY_DIAGNOSTICS: FileTreeDiagnostics = {
  treeFound: false,
  candidateCount: 0,
  complete: false,
  expectedFileCount: null,
  skipped: [],
};

const getScopeState = (store: PinStoreV1, scope: PrScope) =>
  store.scopes[createScopeKey(scope)];

const Root = ({ panel, panelOrigin, scope }: RootProps) => {
  const [storedValue] = useStorageValue('pinStore');
  const store = isPinStoreV1(storedValue) ? storedValue : null;
  const [items, setItems] = useState<FileTreeItem[]>([]);
  const [diagnostics, setDiagnostics] =
    useState<FileTreeDiagnostics>(EMPTY_DIAGNOSTICS);
  const [fingerprint, setFingerprint] = useState('');
  const [pinOnly, setPinOnly] = useState(false);
  const [error, setError] = useState('');
  const [colorMode, setColorMode] = useState(
    document.documentElement.dataset.colorMode ?? 'auto',
  );
  const storeRef = useRef<PinStoreV1 | null>(store);
  const itemsRef = useRef<FileTreeItem[]>(items);
  const snapshotRef = useRef<PanelSnapshot | null>(null);

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
  const postToPanel = useCallback(
    (message: ContentToPanelMessage): void => {
      panel.contentWindow?.postMessage(message, panelOrigin);
    },
    [panel, panelOrigin],
  );
  const snapshot = useMemo<PanelSnapshot>(
    () => ({
      type: 'snapshot',
      colorMode,
      currentFingerprint: fingerprint,
      currentPaths: items.map((item) => item.path),
      error,
      uiNotRecognized:
        diagnostics.treeFound &&
        diagnostics.candidateCount > 0 &&
        ((diagnostics.expectedFileCount !== null && !diagnostics.complete) ||
          items.length === 0),
    }),
    [colorMode, diagnostics, error, fingerprint, items],
  );
  snapshotRef.current = snapshot;

  useEffect(() => postToPanel(snapshot), [postToPanel, snapshot]);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let active = true;
    let scanSequence = 0;
    const expectedScopeKey = createScopeKey(scope);

    const scan = async (): Promise<void> => {
      const sequence = ++scanSequence;
      const extraction = extractFileTreeItems(document, scope);
      if (!active) return;
      setDiagnostics(extraction.diagnostics);
      setItems(extraction.items);
      itemsRef.current = extraction.items;
      const currentScopeState = storeRef.current
        ? getScopeState(storeRef.current, scope)
        : undefined;
      injectPinButtons(
        extraction.items,
        new Set(Object.keys(currentScopeState?.pins ?? {})),
      );
      if (extraction.items.length === 0) {
        stability.cancel();
        setFingerprint('');
        return;
      }
      const nextFingerprint = await createRevisionFingerprint(extraction.items);
      if (!active || sequence !== scanSequence) return;
      const hasExpectedCount =
        extraction.diagnostics.expectedFileCount !== null;
      if (
        (hasExpectedCount && !extraction.diagnostics.complete) ||
        (!hasExpectedCount &&
          !stability.observe(nextFingerprint, extraction.items.length))
      ) {
        if (hasExpectedCount) stability.cancel();
        setFingerprint('');
        return;
      }
      if (hasExpectedCount) stability.cancel();
      setFingerprint(nextFingerprint);
      try {
        await sendMessage('syncPinScope', {
          scope,
          currentFingerprint: nextFingerprint,
          currentPaths: extraction.items.map((item) => item.path),
        });
        if (active) setError('');
      } catch (cause: unknown) {
        if (active)
          setError(cause instanceof Error ? cause.message : String(cause));
      }
    };

    const scheduleScan = (): void => {
      const currentScope = parsePrFilesUrl(location.href);
      if (!currentScope || createScopeKey(currentScope) !== expectedScopeKey) {
        window.dispatchEvent(new Event(NAVIGATION_EVENT));
        return;
      }
      if (timeout !== undefined) return;
      timeout = setTimeout(() => {
        timeout = undefined;
        void scan();
      }, 100);
    };
    const stability = createFileTreeStability(scheduleScan);
    const observer = new MutationObserver((mutations) => {
      if (hasFileTreeMutation(mutations, document)) scheduleScan();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    void scan();
    return () => {
      active = false;
      clearTimeout(timeout);
      stability.cancel();
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
    const onClick = (event: MouseEvent): void => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest<HTMLButtonElement>(
        '[data-pr-focus-pin-path]',
      );
      if (!button?.dataset.prFocusPinPath) return;
      event.preventDefault();
      event.stopPropagation();
      postToPanel({ type: 'selectPath', path: button.dataset.prFocusPinPath });
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  });

  useEffect(() => {
    const onMessage = (event: MessageEvent<unknown>): void => {
      if (
        event.source !== panel.contentWindow ||
        event.origin !== panelOrigin ||
        !isPanelToContentMessage(event.data)
      )
        return;
      const message = event.data;
      if (message.type === 'ready') {
        if (snapshotRef.current) postToPanel(snapshotRef.current);
      } else if (message.type === 'setPinOnly') {
        setPinOnly(message.enabled);
      } else if (message.type === 'setCollapsed') {
        panel.style.width = message.collapsed
          ? '88px'
          : 'min(412px, calc(100vw - 32px))';
        panel.style.height = message.collapsed
          ? '60px'
          : 'min(720px, calc(100vh - 32px))';
      } else {
        const item = itemsRef.current.find(({ path }) => path === message.path);
        const target = item
          ? document.getElementById(item.diffAnchor.slice(1))
          : null;
        if (target) {
          target.scrollIntoView({ block: 'start', behavior: 'smooth' });
          setError('');
        } else {
          setError(`${message.path} is not present in the current file tree.`);
        }
      }
    };
    const onColorMode = (): void =>
      setColorMode(document.documentElement.dataset.colorMode ?? 'auto');
    window.addEventListener('message', onMessage);
    document.addEventListener('color-mode-change', onColorMode);
    return () => {
      window.removeEventListener('message', onMessage);
      document.removeEventListener('color-mode-change', onColorMode);
    };
  }, [panel, panelOrigin, postToPanel]);

  return null;
};

let mounted:
  | {
      controller: HTMLElement;
      panel: HTMLIFrameElement;
      root: ReactRoot;
      rowStyle: HTMLElement;
      scopeKey: string;
    }
  | undefined;

const unmount = (): void => {
  mounted?.root.unmount();
  mounted?.controller.remove();
  mounted?.panel.remove();
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

  const panelUrl = new URL(getExtensionUrl('panel.html'));
  panelUrl.searchParams.set('owner', scope.owner);
  panelUrl.searchParams.set('repository', scope.repository);
  panelUrl.searchParams.set('pullNumber', String(scope.pullNumber));
  const panel = document.createElement('iframe');
  panel.id = PANEL_ID;
  panel.title = 'PR Review Focus Pins';
  panel.src = panelUrl.href;
  panel.style.cssText =
    'position:fixed;right:16px;bottom:16px;z-index:1000;display:block;border:0;width:min(412px,calc(100vw - 32px));height:min(720px,calc(100vh - 32px));';
  document.body.append(panel);

  const controller = document.createElement('div');
  controller.id = CONTROLLER_ID;
  controller.hidden = true;
  document.body.append(controller);
  const rowStyle = document.createElement('style');
  rowStyle.id = ROW_STYLE_ID;
  rowStyle.textContent = rowButtonStyles;
  document.head.append(rowStyle);
  const root = createRoot(controller);
  root.render(
    <Root panel={panel} panelOrigin={panelUrl.origin} scope={scope} />,
  );
  mounted = { controller, panel, root, rowStyle, scopeKey };
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
