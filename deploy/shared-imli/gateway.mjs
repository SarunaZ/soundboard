import http from 'node:http';

const HOP_BY_HOP = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailer', 'transfer-encoding', 'upgrade',
]);

function forwardedHeaders(headers) {
  const result = { ...headers };
  const connection = String(headers.connection ?? '');
  for (const token of connection.split(',')) {
    const name = token.trim().toLowerCase();
    if (name) delete result[name];
  }
  for (const name of HOP_BY_HOP) delete result[name];
  delete result.host;
  return result;
}

export function isEditorRequest(requestUrl) {
  try {
    const pathname = new URL(requestUrl ?? '/', 'http://gateway.invalid').pathname;
    return pathname === '/editor' || pathname.startsWith('/editor/');
  } catch {
    return false;
  }
}

export function createGatewayServer({
  editorPort = 8080,
  imliPort = 4001,
  requestTimeoutMs = 30_000,
  headersTimeoutMs = 15_000,
  keepAliveTimeoutMs = 5_000,
  health = {},
} = {}) {
  const server = http.createServer((request, response) => {
    let pathname;
    try { pathname = new URL(request.url ?? '/', 'http://gateway.invalid').pathname; }
    catch { pathname = ''; }
    if (pathname === '/__shared/live' || pathname === '/__shared/ready') {
      response.setHeader('cache-control', 'no-store');
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.setHeader('allow', 'GET, HEAD');
        response.writeHead(405);
        response.end();
        return;
      }
      const writeHealth = value => {
        const body = Buffer.from(JSON.stringify(value));
        response.setHeader('content-type', 'application/json; charset=utf-8');
        response.setHeader('content-length', body.length);
        response.writeHead(value.alive === false || value.ready === false ? 503 : 200);
        response.end(request.method === 'HEAD' ? undefined : body);
      };
      if (pathname === '/__shared/live') {
        writeHealth({ alive: health.isAlive?.() !== false });
      } else {
        Promise.resolve(health.getReadiness?.() ?? { ready: false, checks: {} })
          .then(value => {
            const checks = {};
            const names = ['imli', 'api', 'worker', 'editorToken', 'running'];
            for (const name of names) {
              if (typeof value.checks?.[name] === 'boolean') checks[name] = value.checks[name];
            }
            writeHealth({ ready: value.ready === true && Object.keys(checks).length === names.length && Object.values(checks).every(Boolean), checks });
          })
          .catch(() => writeHealth({ ready: false, checks: {} }));
      }
      return;
    }
    const editor = isEditorRequest(request.url);
    const upstreamPort = editor ? editorPort : imliPort;
    const upstreamRequest = http.request({
      hostname: '127.0.0.1',
      port: upstreamPort,
      method: request.method,
      path: request.url,
      headers: forwardedHeaders(request.headers),
    }, upstreamResponse => {
      response.writeHead(upstreamResponse.statusCode ?? 502, forwardedHeaders(upstreamResponse.headers));
      upstreamResponse.once('error', () => response.destroy());
      upstreamResponse.once('aborted', () => response.destroy());
      upstreamResponse.pipe(response);
    });

    let finished = false;
    const abortUpstream = () => {
      if (!finished) upstreamRequest.destroy(new Error('Client disconnected'));
    };
    request.once('aborted', abortUpstream);
    request.once('error', () => upstreamRequest.destroy());
    response.once('close', () => {
      if (!response.writableEnded) abortUpstream();
    });
    upstreamRequest.setTimeout(requestTimeoutMs, () => {
      upstreamRequest.destroy(new Error('Upstream request timed out'));
    });
    upstreamRequest.once('response', upstreamResponse => {
      upstreamResponse.once('end', () => { finished = true; });
      upstreamResponse.once('close', () => { finished = true; });
    });
    upstreamRequest.once('error', () => {
      if (response.headersSent) {
        response.destroy();
      } else if (!response.destroyed) {
        response.writeHead(502, { 'content-type': 'application/json; charset=utf-8', connection: 'close' });
        response.end('{"error":"Backend unavailable."}');
      }
    });
    request.pipe(upstreamRequest);
  });
  server.headersTimeout = headersTimeoutMs;
  server.requestTimeout = requestTimeoutMs;
  server.keepAliveTimeout = keepAliveTimeoutMs;
  return server;
}

export function startGateway({ port = Number(process.env.PORT ?? 4000), ...options } = {}) {
  const server = createGatewayServer(options);
  server.listen(port, '0.0.0.0');
  return server;
}
