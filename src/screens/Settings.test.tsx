import { afterEach, describe, expect, test } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import Settings from './Settings';

afterEach(() => cleanup());

const records = [
  { id: 'a', date: '2026-09-20', weightGrams: 70000 },
  { id: 'b', date: '2026-10-20', weightGrams: 72000 },
];

function renderSettings() {
  render(
    <Settings
      records={records}
      unit="kg"
      storageBlocked={false}
      onUnit={() => {}}
      onClear={() => {}}
    />,
  );
}

describe('Settings CSV range', () => {
  test('counts entries inside the range', () => {
    renderSettings();
    expect(screen.getByText(/2 entries in range/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^from$/i), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByLabelText(/^to$/i), { target: { value: '2026-10-31' } });
    expect(screen.getByText(/1 entry in range/i)).toBeInTheDocument();
  });

  test('inverted range disables export and explains why', () => {
    renderSettings();
    fireEvent.change(screen.getByLabelText(/^from$/i), { target: { value: '2026-11-01' } });
    fireEvent.change(screen.getByLabelText(/^to$/i), { target: { value: '2026-10-01' } });
    expect(screen.getByText(/start date must be on or before end date/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /export csv/i })).toBeDisabled();
  });

  test('empty result disables export', () => {
    renderSettings();
    fireEvent.change(screen.getByLabelText(/^from$/i), { target: { value: '2026-11-01' } });
    fireEvent.change(screen.getByLabelText(/^to$/i), { target: { value: '2026-11-10' } });
    expect(screen.getByText(/0 entries in range/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /export csv/i })).toBeDisabled();
  });
});
