import { clearCookieHeader, currentUser, finishSignIn, SESSION_COOKIE, startSignIn } from './auth';
import { HttpError, json, readJson } from './http';
import { parseSnapshot, readSnapshot, writeSnapshot } from './sync';
import type { Env } from './types';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname;
    try {
      if (path === '/api/auth/google' && request.method === 'GET') return startSignIn(env, request);
      if (path === '/api/auth/google/callback' && request.method === 'GET') return finishSignIn(env, request);

      if (path === '/api/me' && request.method === 'GET') {
        const user = await currentUser(env, request);
        if (!user) return json({ error: 'unauthorized' }, 401);
        return json({ email: user.email, name: user.name });
      }

      if (path === '/api/auth/logout' && request.method === 'POST') {
        const user = await currentUser(env, request);
        if (!user) return json({ error: 'unauthorized' }, 401);
        await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(user.sessionHash).run();
        const headers = new Headers();
        headers.append('Set-Cookie', clearCookieHeader(SESSION_COOKIE));
        return new Response(null, { status: 204, headers });
      }

      const user = await currentUser(env, request);

      if (path === '/api/sync' && request.method === 'POST') {
        if (!user) return json({ error: 'unauthorized' }, 401);
        const snapshot = parseSnapshot(await readJson(request), Date.now());
        await writeSnapshot(env, user.sub, snapshot, user.resetAt);
        const merged = await readSnapshot(env, user.sub);
        return json({ ...merged, resetAt: user.resetAt });
      }

      if (path === '/api/records' && request.method === 'DELETE') {
        if (!user) return json({ error: 'unauthorized' }, 401);
        const resetAt = Date.now();
        await env.DB.batch([
          env.DB.prepare('UPDATE users SET reset_at = ? WHERE sub = ?').bind(resetAt, user.sub),
          env.DB.prepare('DELETE FROM entries WHERE user_id = ?').bind(user.sub),
        ]);
        return json({ resetAt });
      }

      if (path === '/api/account' && request.method === 'DELETE') {
        if (!user) return json({ error: 'unauthorized' }, 401);
        await env.DB.batch([
          env.DB.prepare('DELETE FROM entries WHERE user_id = ?').bind(user.sub),
          env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.sub),
          env.DB.prepare('DELETE FROM users WHERE sub = ?').bind(user.sub),
        ]);
        const headers = new Headers();
        headers.append('Set-Cookie', clearCookieHeader(SESSION_COOKIE));
        return new Response(null, { status: 204, headers });
      }

      return json({ error: 'not found' }, 404);
    } catch (error) {
      if (error instanceof HttpError) return json({ error: error.message }, error.status);
      return json({ error: 'internal error' }, 500);
    }
  },
};
