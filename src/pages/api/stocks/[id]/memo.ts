import type { APIRoute } from 'astro';
import { resolveAuth, unauthorized } from '../../../../../worker/auth-helpers';
import { handlePutMemo, handleGetMemo } from '../../../../../worker/handlers/memo';

export const prerender = false;

export const GET: APIRoute = async ({ params, locals, request }) => {
  const env = locals.runtime.env;
  const authContext = await resolveAuth(request, env);
  if (!authContext) return unauthorized();
  return handleGetMemo(params.id!, env, authContext);
};

export const PUT: APIRoute = async ({ params, locals, request }) => {
  const env = locals.runtime.env;
  const authContext = await resolveAuth(request, env);
  if (!authContext) return unauthorized();
  return handlePutMemo(params.id!, request, env, authContext);
};
