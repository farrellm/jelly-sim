/**
 * A Cloudflare Pages Function that forwards /api/* to the Fastify app on Fly.
 *
 * This exists because of a constraint DESIGN.md §14 does not call out. §9.2 puts the
 * session in a `SameSite=Lax` cookie, and §14 puts the client on Cloudflare Pages and the
 * API on Fly — which are different sites. A browser would simply not send the cookie, and
 * every request would be anonymous.
 *
 * Proxying through the same origin keeps the cookie same-site and keeps the CSRF story in
 * §9.3 intact. It also means the client can go on using relative URLs, exactly as it does
 * against the Vite dev proxy.
 *
 * Set API_ORIGIN in the Pages project's environment variables (e.g.
 * https://jelly-sim-api.fly.dev).
 */
interface Env {
  API_ORIGIN: string;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const target = new URL(url.pathname + url.search, context.env.API_ORIGIN);

  const request = new Request(target, context.request);
  // Tell the API which origin the browser actually saw, so the §9.3 Origin check has
  // something truthful to compare against.
  request.headers.set('origin', url.origin);

  return fetch(request);
};
