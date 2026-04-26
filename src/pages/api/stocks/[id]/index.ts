import type { APIRoute } from 'astro';
import { resolveAuth, unauthorized } from '../../../../../worker/auth-helpers';
import { handleGetStock, handleDeleteStock } from '../../../../../worker/handlers/stocks';

export const prerender = false;

export const GET: APIRoute = async ({ params, locals, request }) => {
  const env = locals.runtime.env;
  const authContext = await resolveAuth(request, env);
  if (!authContext) return unauthorized();
  return handleGetStock(params.id!, env, authContext);
};

export const DELETE: APIRoute = async ({ params, locals, request }) => {
  const env = locals.runtime.env;
  const authContext = await resolveAuth(request, env);
  if (!authContext) return unauthorized();
  return handleDeleteStock(params.id!, env, authContext);
};
