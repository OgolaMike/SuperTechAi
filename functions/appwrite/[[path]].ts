// Cloudflare Pages same-origin proxy for Appwrite API requests.
// Appwrite's session cookie is rewritten as host-only on the Pages domain,
// avoiding third-party-cookie blocking in mobile browsers.
type PagesContext = { request: Request };
const APPWRITE_ORIGIN = 'https://fra.cloud.appwrite.io';
const APPWRITE_PROJECT = '6b06de46003dde834eb6';

export async function onRequest({ request }: PagesContext): Promise<Response> {
  const incoming = new URL(request.url);
  const upstream = new URL(APPWRITE_ORIGIN);
  upstream.pathname = '/v1' + incoming.pathname.replace(/^\/appwrite(?=\/|$)/, '');
  upstream.search = incoming.search;
  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('content-length');
  if (!headers.has('x-appwrite-project')) headers.set('x-appwrite-project', APPWRITE_PROJECT);
  const body = request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.arrayBuffer();
  const upstreamResponse = await fetch(upstream.toString(), { method: request.method, headers, body, redirect: 'manual' });
  const responseHeaders = new Headers(upstreamResponse.headers);
  responseHeaders.delete('content-encoding');
  responseHeaders.delete('content-length');
  responseHeaders.set('Cache-Control', 'no-store');
  const cookies = upstreamResponse.headers.getSetCookie?.() ?? [];
  if (cookies.length) {
    responseHeaders.delete('set-cookie');
    for (const cookie of cookies) responseHeaders.append('set-cookie', cookie.replace(/; *domain=[^;]+/i, ''));
  } else {
    const cookie = responseHeaders.get('set-cookie');
    if (cookie) responseHeaders.set('set-cookie', cookie.replace(/; *domain=[^;]+/i, ''));
  }
  return new Response(upstreamResponse.body, { status: upstreamResponse.status, statusText: upstreamResponse.statusText, headers: responseHeaders });
}
