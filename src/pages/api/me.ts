import type { APIRoute } from 'astro';
import { resolveAuth, unauthorized } from '../../../worker/auth-helpers';

export const prerender = false;

export const GET: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  const authContext = await resolveAuth(request, env);
  if (!authContext) return unauthorized();

  const user = await env.DB.prepare(
    'SELECT id, email, name FROM users WHERE id = ?',
  )
    .bind(authContext.userId)
    .first<{ id: string; email: string; name: string }>();
  if (!user) return unauthorized();
  return Response.json(user);
};
