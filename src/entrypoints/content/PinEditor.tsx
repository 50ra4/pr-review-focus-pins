import { useState, type FormEvent } from 'react';
import { countCodePoints } from '../../lib/pins/guards';
import { PIN_LIMITS } from '../../lib/pins/pinStore';
import type { PinReason } from '../../lib/pins/types';

const REASONS: ReadonlyArray<{ value: PinReason; label: string }> = [
  { value: 'revisit', label: 'Revisit' },
  { value: 'question', label: 'Question' },
  { value: 'test', label: 'Test' },
  { value: 'risk', label: 'Risk' },
  { value: 'custom', label: 'Custom' },
];

type PinEditorProps = {
  path: string;
  initialReason: PinReason;
  initialNote: string;
  isSaving: boolean;
  saveError?: string;
  onSave: (reason: PinReason, note: string) => void;
  onCancel: () => void;
};

export const PinEditor = ({
  path,
  initialReason,
  initialNote,
  isSaving,
  saveError,
  onSave,
  onCancel,
}: PinEditorProps) => {
  const [reason, setReason] = useState<PinReason>(initialReason);
  const [note, setNote] = useState(initialNote);
  const noteLength = countCodePoints(note.trim());
  const isOverLimit = noteLength > PIN_LIMITS.noteCodePoints;

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!isSaving && !isOverLimit) onSave(reason, note.trim());
  };

  return (
    <form className="editor" onSubmit={submit}>
      <div className="editor__heading">
        <h3>Edit focus pin</h3>
        <button
          aria-label="Close editor"
          className="icon-button"
          onClick={onCancel}
          type="button"
        >
          <svg aria-hidden="true" viewBox="0 0 16 16">
            <path d="m3.7 3.7 8.6 8.6m0-8.6-8.6 8.6" />
          </svg>
        </button>
      </div>
      <p className="editor__path" title={path}>
        {path}
      </p>
      <label htmlFor="pr-focus-pins-reason">Reason</label>
      <select
        disabled={isSaving}
        id="pr-focus-pins-reason"
        onChange={(event) => setReason(event.currentTarget.value as PinReason)}
        value={reason}
      >
        {REASONS.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
      <div className="editor__label-row">
        <label htmlFor="pr-focus-pins-note">Note</label>
        <span aria-live="polite">
          {noteLength}/{PIN_LIMITS.noteCodePoints}
        </span>
      </div>
      <textarea
        disabled={isSaving}
        id="pr-focus-pins-note"
        onChange={(event) => setNote(event.currentTarget.value)}
        rows={4}
        value={note}
      />
      {isOverLimit && (
        <p className="error" role="alert">
          Note cannot exceed {PIN_LIMITS.noteCodePoints} characters.
        </p>
      )}
      {saveError && (
        <p className="error" role="alert">
          {saveError}
        </p>
      )}
      <div className="editor__actions">
        <button
          className="button button--secondary"
          onClick={onCancel}
          type="button"
        >
          Cancel
        </button>
        <button
          className="button button--primary"
          disabled={isSaving || isOverLimit}
          type="submit"
        >
          {isSaving ? 'Saving…' : 'Save pin'}
        </button>
      </div>
    </form>
  );
};
