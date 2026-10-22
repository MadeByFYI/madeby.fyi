// Content negotiation for the home page: a client that asks for Markdown (Accept: text/markdown) gets
// /index.md instead of the HTML. Browsers never ask for it, so they see the page as before. Routed to
// "/" only (_routes.json), so every other file is served straight from the asset store.
export async function onRequest({ request, next, env }) {
  const url = new URL(request.url);
  if (url.pathname === "/" && /text\/markdown/i.test(request.headers.get("accept") ?? "")) {
    const md = await env.ASSETS.fetch(new URL("/index.md", url));
    return new Response(md.body, {
      status: md.status,
      headers: { "Content-Type": "text/markdown; charset=utf-8", Vary: "Accept", "Access-Control-Allow-Origin": "*" },
    });
  }
  const res = await next();
  const out = new Response(res.body, res);
  out.headers.append("Vary", "Accept");
  return out;
}
