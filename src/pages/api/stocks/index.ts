import type { APIRoute } from 'astro';
import { resolveAuth, unauthorized } from '../../../../worker/auth-helpers';
import { handleCreateStock, handleListStocks } from '../../../../worker/handlers/stocks';

export const prerender = false;

export const GET: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  const authContext = await resolveAuth(request, env);
  if (!authContext) return unauthorized();
  return handleListStocks(request, env, authContext);
};

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  const authContext = await resolveAuth(request, env);
  if (!authContext) return unauthorized();
  return handleCreateStock(request, env, authContext);
};
