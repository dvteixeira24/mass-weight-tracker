import { afterEach, describe, expect, test } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import Settings from './Settings';

afterEach(() => cleanup());

const records = [
  { id: 'a', date: '2026-09-20', weightGrams: 70000 },
  { id: 'b', date: '2026-10-20', weightGrams: 72000 },
];

const signedOut = {
  status: 'signed-out' as const,
  onSyncNow: () => {},
  onSignOut: () => {},
  onDeleteAccount: () => {},
};

function renderSettings() {
  render(
    <Settings
      records={records}
      unit="kg"
      storageBlocked={false}
      onUnit={() => {}}
      onClear={() => {}}
      sync={signedOut}
    />,
  );
}

function renderWithSync(sync: Parameters<typeof Settings>[0]['sync']) {
  render(
    <Settings
      records={records}
      unit="kg"
      storageBlocked={false}
      onUnit={() => {}}
      onClear={() => {}}
      sync={sync}
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

describe('Settings account card', () => {
  test('signed out shows a Google sign-in link and no sync controls', () => {
    renderWithSync(signedOut);
    expect(screen.getByRole('link', { name: /sign in with google/i })).toHaveAttribute(
      'href',
      '/api/auth/google',
    );
    expect(screen.queryByRole('button', { name: /sync now/i })).not.toBeInTheDocument();
  });

  test('signed in shows the account, sync status, and sign-out', () => {
    renderWithSync({
      status: 'idle',
      email: 'person@example.com',
      lastSyncedAt: 1_800_000_000_000,
      onSyncNow: () => {},
      onSignOut: () => {},
      onDeleteAccount: () => {},
    });
    expect(screen.getByText(/person@example.com/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sync now/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument();
  });
});
