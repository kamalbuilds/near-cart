// Serves the built app from ../dist and forwards /api/* to the Cart API,
// which keeps the SP3ND session and NEAR keys on the operator's machine.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    if (!env.CART_API_ORIGIN) return Response.json({ error: 'Cart API origin is not configured.' }, { status: 503 });
    if (!['GET', 'POST'].includes(request.method)) return Response.json({ error: 'Method not allowed' }, { status: 405 });
    const upstream = new URL(url.pathname + url.search, env.CART_API_ORIGIN);
    const headers = new Headers();
    for (const name of ['content-type', 'x-cart-session']) if (request.headers.has(name)) headers.set(name, request.headers.get(name));
    const res = await fetch(upstream, { method: request.method, headers, body: request.method === 'POST' ? request.body : undefined });
    return new Response(res.body, { status: res.status, headers: { 'content-type': res.headers.get('content-type') ?? 'application/json', 'cache-control': 'no-store' } });
  },
};
