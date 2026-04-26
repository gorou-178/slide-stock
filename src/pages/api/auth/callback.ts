import type { APIRoute } from 'astro';
import { handleCallback } from '../../../../worker/handlers/auth';

export const prerender = false;

export const GET: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  return handleCallback(request, env);
};
