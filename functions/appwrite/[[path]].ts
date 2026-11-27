// Same-origin Appwrite proxy for Cloudflare Pages.
// Keeps Appwrite session cookies on the Pages hostname so mobile browsers
// do not have to accept third-party cookies from fra.cloud.appwrite.io.
type PagesContext = {
  request: Request;
};

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
  if (!headers.has('x-appwrite-project')) {
    headers.set('x-appwrite-project', APPWRITE_PROJECT);
  }

  let body: BodyInit | null = null;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    body = await request.arrayBuffer();
  }

  const upstreamResponse = await fetch(upstream.toString(), {
    method: request.method,
    headers,
    body,
    redirect: 'manual',
  });

  const responseHeaders = new Headers(upstreamResponse.headers);
  responseHeaders.delete('content-encoding');
  responseHeaders.delete('content-length');
  responseHeaders.set('Cache-Control', 'no-store');

  // Appwrite scopes its session cookie to cloud.appwrite.io. Strip only the
  // Domain attribute so the browser stores it as a first-party Pages cookie.
  const cookies = upstreamResponse.headers.getSetCookie?.() ?? [];
  if (cookies.length > 0) {
    responseHeaders.delete('set-cookie');
    for (const cookie of cookies) {
      responseHeaders.append('set-cookie', cookie.replace(/; *domain=[^;]+/i, ''));
    }
  } else {
    const cookie = responseHeaders.get('set-cookie');
    if (cookie) responseHeaders.set('set-cookie', cookie.replace(/; *domain=[^;]+/i, ''));
  }

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders,
  });
}
