import { describe, expect, test, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import App from './App';

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => cleanup());

describe('App journeys', () => {
  test('first visit shows onboarding; blank start reaches overview empty state', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /start tracking/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^start tracking$/i }));
    expect(screen.getByText(/no measurements yet/i)).toBeInTheDocument();
  });
  test('onboarding with initial weight logs for today; return visit skips onboarding', () => {
    const { unmount } = render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /^pounds \(lb\)$/i }));
    fireEvent.change(screen.getByLabelText(/today's weight/i), { target: { value: '150' } });
    fireEvent.click(screen.getByRole('button', { name: /^start tracking$/i }));
    expect(screen.getByText(/latest weight/i)).toBeInTheDocument();
    unmount();
    render(<App />);
    expect(screen.queryByText(/welcome/i)).not.toBeInTheDocument();
    expect(screen.getByText(/latest weight/i)).toBeInTheDocument();
  });
});
