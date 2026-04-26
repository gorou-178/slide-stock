import type { APIRoute } from 'astro';
import { handleLogout } from '../../../../worker/handlers/auth';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  return handleLogout(request, env);
};
