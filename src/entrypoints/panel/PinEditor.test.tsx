import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PinEditor } from './PinEditor';

describe('PinEditor', () => {
  it('saves the selected reason and trimmed note', () => {
    const onSave = vi.fn();
    render(
      <PinEditor
        initialNote=""
        initialReason="revisit"
        isSaving={false}
        onCancel={vi.fn()}
        onSave={onSave}
        path="src/security.ts"
      />,
    );

    fireEvent.change(screen.getByLabelText('Reason'), {
      target: { value: 'risk' },
    });
    fireEvent.change(screen.getByLabelText('Note'), {
      target: { value: '  review auth boundary  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save pin' }));

    expect(onSave).toHaveBeenCalledWith('risk', 'review auth boundary');
  });

  it('keeps an over-limit Unicode draft and blocks saving', () => {
    render(
      <PinEditor
        initialNote=""
        initialReason="custom"
        isSaving={false}
        onCancel={vi.fn()}
        onSave={vi.fn()}
        path="src/a.ts"
      />,
    );

    fireEvent.change(screen.getByLabelText('Note'), {
      target: { value: '📌'.repeat(201) },
    });

    expect(screen.getByRole('alert')).toHaveTextContent('200 characters');
    expect(screen.getByRole('button', { name: 'Save pin' })).toBeDisabled();
    expect(screen.getByLabelText('Note')).toHaveValue('📌'.repeat(201));
  });
});
