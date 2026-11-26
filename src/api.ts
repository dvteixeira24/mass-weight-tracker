import type { Snapshot } from './domain/sync';

export interface Me {
  email: string;
  name: string | null;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) throw new Error(`request failed: ${response.status}`);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function getMe(): Promise<Me | null> {
  try {
    return await request<Me>('/api/me');
  } catch {
    return null;
  }
}

export function logout(): Promise<void> {
  return request<void>('/api/auth/logout', { method: 'POST' });
}

export function syncNow(snapshot: Snapshot): Promise<Snapshot & { resetAt: number }> {
  return request<Snapshot & { resetAt: number }>('/api/sync', {
    method: 'POST',
    body: JSON.stringify(snapshot),
  });
}

export function clearRemote(): Promise<{ resetAt: number }> {
  return request<{ resetAt: number }>('/api/records', { method: 'DELETE' });
}

export function deleteAccount(): Promise<void> {
  return request<void>('/api/account', { method: 'DELETE' });
}
