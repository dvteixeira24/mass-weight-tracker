import type { Env } from './types';

export const SESSION_COOKIE = 'mass_session';
export const STATE_COOKIE = 'mass_oauth_state';
export const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export function getCookie(request: Request, name: string): string | null {
  const header = request.headers.get('Cookie') ?? '';
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

export function cookieHeader(name: string, value: string, maxAgeSeconds: number, path = '/'): string {
  return `${name}=${encodeURIComponent(value)}; Path=${path}; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

export function clearCookieHeader(name: string, path = '/'): string {
  return `${name}=; Path=${path}; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function randomToken(bytes = 32): string {
  const array = crypto.getRandomValues(new Uint8Array(bytes));
  let text = '';
  for (const byte of array) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function originFor(env: Env, request: Request): string {
  return env.APP_ORIGIN || new URL(request.url).origin;
}

export interface SessionUser {
  sub: string;
  email: string;
  name: string | null;
  resetAt: number;
  sessionHash: string;
}

export function startSignIn(env: Env, request: Request): Response {
  const state = randomToken(16);
  const origin = originFor(env, request);
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
  url.searchParams.set('redirect_uri', `${origin}/api/auth/google/callback`);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', state);
  url.searchParams.set('access_type', 'online');
  const headers = new Headers();
  headers.append('Set-Cookie', cookieHeader(STATE_COOKIE, state, 600, '/api/auth'));
  headers.set('Location', url.toString());
  return new Response(null, { status: 302, headers });
}

function failure(message: string): Response {
  return new Response(
    `<!doctype html><meta charset="utf-8"><title>Sign-in failed</title><p>${message}</p><p><a href="/">Back to mass.</a></p>`,
    { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } },
  );
}

export async function finishSignIn(env: Env, request: Request): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const expected = getCookie(request, STATE_COOKIE);
  if (!code || !state || !expected || !constantTimeEqual(state, expected)) {
    return failure('Invalid sign-in response. Try again.');
  }

  const redirectUri = `${originFor(env, request)}/api/auth/google/callback`;
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  if (!tokenRes.ok) return failure('Google rejected the sign-in. Try again.');
  const tokens = (await tokenRes.json()) as { access_token?: string };
  if (!tokens.access_token) return failure('Google did not return an access token.');

  const infoRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!infoRes.ok) return failure('Could not read your Google profile.');
  const info = (await infoRes.json()) as { sub?: string; email?: string; name?: string };
  if (!info.sub || !info.email) return failure('Google profile is missing an id or email.');

  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO users (sub, email, name, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(sub) DO UPDATE SET email = excluded.email, name = excluded.name',
    ).bind(info.sub, info.email, info.name ?? null, now),
    env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now),
  ]);

  const token = randomToken();
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .bind(await sha256Hex(token), info.sub, now, now + SESSION_TTL_MS)
    .run();

  const headers = new Headers();
  headers.append('Set-Cookie', cookieHeader(SESSION_COOKIE, token, SESSION_TTL_MS / 1000));
  headers.append('Set-Cookie', clearCookieHeader(STATE_COOKIE, '/api/auth'));
  headers.set('Location', '/');
  return new Response(null, { status: 302, headers });
}

export async function currentUser(env: Env, request: Request): Promise<SessionUser | null> {
  const token = getCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const sessionHash = await sha256Hex(token);
  const row = await env.DB.prepare(
    'SELECT u.sub, u.email, u.name, u.reset_at AS resetAt, s.token_hash AS sessionHash FROM sessions s JOIN users u ON u.sub = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?',
  )
    .bind(sessionHash, Date.now())
    .first<SessionUser>();
  return row ?? null;
}
