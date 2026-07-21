import { StrictMode, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './focusPins.css';
import { FocusPinsPanel } from './FocusPinsPanel';
import {
  isContentToPanelMessage,
  type PanelSnapshot,
  type PanelToContentMessage,
} from '../../lib/messaging/panelBridge';
import { sendMessage } from '../../lib/messaging/messages';
import { createScopeKey, isPinStoreV1, isPrScope } from '../../lib/pins/guards';
import { getStalePins } from '../../lib/pins/pinStore';
import type { PinReason, PrScope } from '../../lib/pins/types';
import { useStorageValue } from '../../lib/storage';

const GITHUB_ORIGIN = 'https://github.com';
const EMPTY_SNAPSHOT: PanelSnapshot = {
  type: 'snapshot',
  colorMode: 'auto',
  currentFingerprint: '',
  currentPaths: [],
  error: '',
  uiNotRecognized: false,
};

const readScope = (): PrScope | null => {
  const parameters = new URLSearchParams(location.search);
  const scope = {
    owner: parameters.get('owner'),
    repository: parameters.get('repository'),
    pullNumber: Number(parameters.get('pullNumber')),
  };
  return isPrScope(scope) ? scope : null;
};

const postCommand = (message: PanelToContentMessage): void => {
  window.parent.postMessage(message, GITHUB_ORIGIN);
};

const Root = ({ scope }: { scope: PrScope }) => {
  const [storedValue] = useStorageValue('pinStore');
  const validStore = isPinStoreV1(storedValue);
  const store = validStore ? storedValue : null;
  const [snapshot, setSnapshot] = useState(EMPTY_SNAPSHOT);
  const [pinOnly, setPinOnly] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [jumpIndex, setJumpIndex] = useState(-1);

  useEffect(() => {
    const onMessage = (event: MessageEvent<unknown>): void => {
      if (
        event.source !== window.parent ||
        event.origin !== GITHUB_ORIGIN ||
        !isContentToPanelMessage(event.data)
      ) {
        return;
      }
      if (event.data.type === 'selectPath') {
        setSaveError('');
        setSelectedPath(event.data.path);
        return;
      }
      setSnapshot(event.data);
      document.documentElement.dataset.colorMode = event.data.colorMode;
    };
    window.addEventListener('message', onMessage);
    postCommand({ type: 'ready' });
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const scopeState = store?.scopes[createScopeKey(scope)];
  const stalePaths = useMemo(
    () =>
      new Set(
        scopeState
          ? getStalePins(scopeState, snapshot.currentPaths).map(
              (pin) => pin.path,
            )
          : [],
      ),
    [scopeState, snapshot.currentPaths],
  );
  const pins = useMemo(
    () =>
      Object.values(scopeState?.pins ?? {})
        .toSorted((left, right) => left.path.localeCompare(right.path))
        .map((pin) => ({ pin, stale: stalePaths.has(pin.path) })),
    [scopeState, stalePaths],
  );

  const savePin = async (reason: PinReason, note: string): Promise<void> => {
    if (!selectedPath) return;
    if (!snapshot.currentFingerprint) {
      setSaveError('The GitHub file tree is still loading. Try again shortly.');
      return;
    }
    setIsSaving(true);
    setSaveError('');
    try {
      await sendMessage('upsertPin', {
        scope,
        path: selectedPath,
        reason,
        note,
        currentFingerprint: snapshot.currentFingerprint,
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
    postCommand({ type: 'jump', path });
  };

  const jumpRelative = (offset: number): void => {
    const available = pins.filter(({ stale }) => !stale);
    if (available.length === 0) return;
    const nextIndex =
      (jumpIndex + offset + available.length) % available.length;
    setJumpIndex(nextIndex);
    jumpTo(available[nextIndex].pin.path);
  };

  const clearScope = async (): Promise<void> => {
    if (!window.confirm('Delete all focus pins for this PR?')) return;
    try {
      await sendMessage('clearPinScope', { scope });
      setSelectedPath(null);
      setPinOnly(false);
      postCommand({ type: 'setPinOnly', enabled: false });
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const acknowledgeChanges = async (): Promise<void> => {
    if (!snapshot.currentFingerprint) {
      setError('The GitHub file tree is still loading. Try again shortly.');
      return;
    }
    try {
      await sendMessage('acknowledgePinScope', {
        scope,
        currentFingerprint: snapshot.currentFingerprint,
      });
      setError('');
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
      postCommand({ type: 'setPinOnly', enabled: false });
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
      error={
        validStore ? error || snapshot.error : 'Stored data needs migration.'
      }
      isSaving={isSaving}
      onAcknowledgeChanges={() => void acknowledgeChanges()}
      onCancelEdit={() => setSelectedPath(null)}
      onClearAll={() => void clearAll()}
      onClearScope={() => void clearScope()}
      onEdit={setSelectedPath}
      onJump={jumpTo}
      onNext={() => jumpRelative(1)}
      onPrevious={() => jumpRelative(-1)}
      onRemove={(path) => void remove(path)}
      onSave={(reason, note) => void savePin(reason, note)}
      onToggleCollapsed={() => {
        const next = !collapsed;
        setCollapsed(next);
        postCommand({ type: 'setCollapsed', collapsed: next });
      }}
      onTogglePinOnly={(enabled) => {
        setPinOnly(enabled);
        postCommand({ type: 'setPinOnly', enabled });
      }}
      pinOnly={pinOnly}
      pins={pins}
      saveError={saveError}
      scope={scope}
      selectedPath={selectedPath}
      uiNotRecognized={snapshot.uiNotRecognized}
    />
  );
};

const scope = readScope();
// oxlint-disable-next-line typescript/no-non-null-assertion
const root = createRoot(document.getElementById('root')!);
root.render(
  <StrictMode>
    {scope ? <Root scope={scope} /> : <p>Invalid PR scope.</p>}
  </StrictMode>,
);
