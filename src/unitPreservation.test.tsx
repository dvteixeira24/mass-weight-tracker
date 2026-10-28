import { describe, expect, test, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import App from './App';
import { STORAGE_KEY } from './storage/weightRepository';

const seed = {
  schemaVersion: 1,
  preferences: { unit: 'kg', onboardingComplete: true },
  records: [{ id: 'a', date: '2026-10-20', weightGrams: 70000 }],
};

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
});
afterEach(() => cleanup());

describe('unit toggle preserves canonical grams', () => {
  test('kg -> lb keeps weightGrams, display converts', () => {
    render(<App />);
    expect(screen.getAllByText(/70\.0/).length).toBeGreaterThanOrEqual(1);
    fireEvent.click(screen.getByRole('button', { name: /open settings/i }));
    const group = screen.getByRole('group', { name: /units/i });
    fireEvent.click(within(group).getByRole('button', { name: /^lb$/i }));
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(stored.records[0].weightGrams).toBe(70000);
    expect(stored.preferences.unit).toBe('lb');
    // grams preserved; display converts on Overview
    fireEvent.click(screen.getByRole('button', { name: /^overview$/i }));
    expect(screen.getAllByText(/154\.3/).length).toBeGreaterThanOrEqual(1);
  });
});
