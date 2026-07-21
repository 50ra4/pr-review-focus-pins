import type { FilePin, PinReason, PrScope } from '../../lib/pins/types';
import { PinEditor } from './PinEditor';

type PinView = {
  pin: FilePin;
  stale: boolean;
};

type FocusPinsPanelProps = {
  scope: PrScope;
  pins: readonly PinView[];
  changed: boolean;
  pinOnly: boolean;
  collapsed: boolean;
  uiNotRecognized: boolean;
  error: string;
  selectedPath: string | null;
  isSaving: boolean;
  saveError: string;
  onToggleCollapsed: () => void;
  onAcknowledgeChanges: () => void;
  onTogglePinOnly: (enabled: boolean) => void;
  onPrevious: () => void;
  onNext: () => void;
  onJump: (path: string) => void;
  onEdit: (path: string) => void;
  onRemove: (path: string) => void;
  onSave: (reason: PinReason, note: string) => void;
  onCancelEdit: () => void;
  onClearScope: () => void;
  onClearAll: () => void;
};

const REASON_LABELS: Record<PinReason, string> = {
  revisit: 'Revisit',
  question: 'Question',
  test: 'Test',
  risk: 'Risk',
  custom: 'Custom',
};

export const FocusPinsPanel = ({
  scope,
  pins,
  changed,
  pinOnly,
  collapsed,
  uiNotRecognized,
  error,
  selectedPath,
  isSaving,
  saveError,
  onToggleCollapsed,
  onAcknowledgeChanges,
  onTogglePinOnly,
  onPrevious,
  onNext,
  onJump,
  onEdit,
  onRemove,
  onSave,
  onCancelEdit,
  onClearScope,
  onClearAll,
}: FocusPinsPanelProps) => {
  const staleCount = pins.filter(({ stale }) => stale).length;
  const selected = selectedPath
    ? pins.find(({ pin }) => pin.path === selectedPath)?.pin
    : undefined;

  if (collapsed) {
    return (
      <button
        aria-label={`Expand Focus Pins panel, ${pins.length} pins`}
        className="collapsed-button"
        onClick={onToggleCollapsed}
        type="button"
      >
        <svg aria-hidden="true" viewBox="0 0 16 16">
          <path d="M4.5 1.5h7L10 4v3l2 2H8.7v5.5H7.3V9H4l2-2V4Z" />
        </svg>
        <span>{pins.length}</span>
      </button>
    );
  }

  return (
    <section aria-label="PR Review Focus Pins" className="panel">
      <header className="panel__header">
        <div>
          <p className="eyebrow">PR REVIEW</p>
          <h2>Focus Pins</h2>
          <p className="scope">
            {scope.owner}/{scope.repository} #{scope.pullNumber}
          </p>
        </div>
        <button
          aria-label="Collapse Focus Pins panel"
          className="icon-button"
          onClick={onToggleCollapsed}
          type="button"
        >
          <svg aria-hidden="true" viewBox="0 0 16 16">
            <path d="M3 8h10" />
          </svg>
        </button>
      </header>

      <div className="summary" aria-label="Pin summary">
        <strong>{pins.length}</strong> pins
        <span aria-hidden="true">·</span>
        <strong>{staleCount}</strong> stale
      </div>

      {changed && (
        <div className="notice" role="status">
          <span>PR changed since last review</span>
          <button
            className="text-button notice__action"
            onClick={onAcknowledgeChanges}
            type="button"
          >
            Acknowledge changes
          </button>
        </div>
      )}
      {uiNotRecognized && (
        <p className="error" role="alert">
          GitHub UI not recognized. No file rows were changed.
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <label className="toggle">
        <input
          checked={pinOnly}
          onChange={(event) => onTogglePinOnly(event.currentTarget.checked)}
          type="checkbox"
        />
        <span>Show pinned files only</span>
      </label>

      <div className="navigation" aria-label="Pin navigation">
        <button
          className="button button--secondary"
          disabled={pins.length === 0}
          onClick={onPrevious}
          type="button"
        >
          Previous
        </button>
        <button
          className="button button--secondary"
          disabled={pins.length === 0}
          onClick={onNext}
          type="button"
        >
          Next
        </button>
      </div>

      {selectedPath && (
        <PinEditor
          initialNote={selected?.note ?? ''}
          initialReason={selected?.reason ?? 'revisit'}
          isSaving={isSaving}
          key={selectedPath}
          onCancel={onCancelEdit}
          onSave={onSave}
          path={selectedPath}
          saveError={saveError}
        />
      )}

      <div className="pin-list" aria-live="polite">
        {pins.length === 0 ? (
          <p className="empty">
            Pin a file to build your private review queue.
          </p>
        ) : (
          <ul>
            {pins.map(({ pin, stale }) => (
              <li key={pin.path}>
                <div className="pin-list__heading">
                  <button
                    className="path-button"
                    disabled={stale}
                    onClick={() => onJump(pin.path)}
                    title={pin.path}
                    type="button"
                  >
                    {pin.path}
                  </button>
                  <span className={`reason reason--${pin.reason}`}>
                    {REASON_LABELS[pin.reason]}
                  </span>
                  {stale && <span className="stale">Stale</span>}
                </div>
                {pin.note && <p className="pin-note">{pin.note}</p>}
                <div className="pin-list__actions">
                  <button
                    aria-label={`Edit ${pin.path}`}
                    className="text-button"
                    onClick={() => onEdit(pin.path)}
                    type="button"
                  >
                    Edit
                  </button>
                  <button
                    aria-label={`Remove ${pin.path}`}
                    className="text-button text-button--danger"
                    onClick={() => onRemove(pin.path)}
                    type="button"
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <details className="data-actions">
        <summary>Data controls</summary>
        <div>
          <button
            className="button button--danger"
            disabled={pins.length === 0}
            onClick={onClearScope}
            type="button"
          >
            Delete this PR’s data
          </button>
          <button
            className="button button--danger"
            onClick={onClearAll}
            type="button"
          >
            Delete all pin data
          </button>
        </div>
      </details>

      <footer>Stored only on this device. No GitHub API is used.</footer>
    </section>
  );
};
