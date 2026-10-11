import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { createGatewayServer, isEditorRequest } from './gateway.mjs';

async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return server.address().port;
}

async function close(server) {
  if (!server.listening) return;
  const closed = new Promise(resolve => server.close(resolve));
  server.closeAllConnections?.();
  await closed;
}

function request(url, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const outgoing = http.request(url, { method, headers, agent: false }, incoming => {
      const chunks = [];
      incoming.on('data', chunk => chunks.push(chunk));
      incoming.once('error', reject);
      incoming.once('aborted', () => reject(new Error('Response aborted')));
      incoming.once('end', () => resolve({ status: incoming.statusCode, headers: incoming.headers, body: Buffer.concat(chunks) }));
    });
    outgoing.once('error', reject);
    outgoing.end(body);
  });
}

test('editor routing matches only the path boundary and ignores query strings', () => {
  assert.equal(isEditorRequest('/editor'), true);
  assert.equal(isEditorRequest('/editor?x=1'), true);
  assert.equal(isEditorRequest('/editor/sessions/1?download=1'), true);
  assert.equal(isEditorRequest('/editorial'), false);
  assert.equal(isEditorRequest('/health'), false);
});

test('gateway preserves stream, authorization, range, status, and end-to-end headers', async () => {
  let editorHits = 0;
  let imliHits = 0;
  const editor = http.createServer((request, response) => {
    editorHits++;
    assert.equal(request.method, 'PUT');
    assert.equal(request.url, '/editor/upload?part=2');
    assert.equal(request.headers.authorization, 'Bearer local-test');
    assert.equal(request.headers.range, 'bytes=3-7');
    assert.equal(request.headers['x-hop-secret'], undefined);
    const chunks = [];
    request.on('data', chunk => chunks.push(chunk));
    request.on('end', () => {
      response.writeHead(206, { 'content-type': 'application/octet-stream', 'content-range': 'bytes 3-7/10', connection: 'keep-alive', 'x-end-to-end': 'preserved' });
      response.write(Buffer.concat(chunks).subarray(0, 2));
      setTimeout(() => response.end(Buffer.concat(chunks).subarray(2)), 10);
    });
  });
  const imli = http.createServer((_request, response) => {
    imliHits++;
    response.end('imli');
  });
  const editorPort = await listen(editor);
  const imliPort = await listen(imli);
  const gateway = createGatewayServer({ editorPort, imliPort });
  const gatewayPort = await listen(gateway);
  try {
    const response = await request(`http://127.0.0.1:${gatewayPort}/editor/upload?part=2`, {
      method: 'PUT',
      headers: { authorization: 'Bearer local-test', range: 'bytes=3-7', connection: 'x-hop-secret', 'x-hop-secret': 'strip-me' },
      body: 'streamed body',
    });
    assert.equal(response.status, 206);
    assert.equal(response.headers['content-range'], 'bytes 3-7/10');
    assert.equal(response.headers['x-end-to-end'], 'preserved');
    assert.equal(response.headers['x-hop-secret'], undefined);
    assert.equal(response.body.toString(), 'streamed body');
    const imliResponse = await request(`http://127.0.0.1:${gatewayPort}/health`);
    assert.equal(imliResponse.body.toString(), 'imli');
    assert.equal(editorHits, 1);
    assert.equal(imliHits, 1);
  } finally {
    await close(gateway);
    await close(editor);
    await close(imli);
  }
});

test('gateway maps unavailable backends and stalled upstreams to 502', async () => {
  const stalled = http.createServer(() => {});
  const stalledPort = await listen(stalled);
  const gateway = createGatewayServer({ editorPort: 1, imliPort: stalledPort, requestTimeoutMs: 100 });
  const port = await listen(gateway);
  try {
    const unavailable = await request(`http://127.0.0.1:${port}/editor/sessions`);
    assert.equal(unavailable.status, 502);
    assert.deepEqual(JSON.parse(unavailable.body.toString()), { error: 'Backend unavailable.' });
    const timedOut = await request(`http://127.0.0.1:${port}/health`);
    assert.equal(timedOut.status, 502);
    assert.deepEqual(JSON.parse(timedOut.body.toString()), { error: 'Backend unavailable.' });
  } finally {
    await close(gateway);
    await close(stalled);
  }
});

test('truncated upstream response closes only that client response; gateway remains available', async () => {
  const editor = http.createServer((request, response) => {
    if (request.url === '/editor/truncated') {
      response.writeHead(200, { 'content-length': '100' });
      response.write('partial');
      setTimeout(() => response.destroy(), 10);
      return;
    }
    response.end('healthy');
  });
  const imli = http.createServer((_request, response) => response.end('imli'));
  const editorPort = await listen(editor);
  const imliPort = await listen(imli);
  const gateway = createGatewayServer({ editorPort, imliPort });
  const gatewayPort = await listen(gateway);
  try {
    await assert.rejects(request(`http://127.0.0.1:${gatewayPort}/editor/truncated`));
    const health = await request(`http://127.0.0.1:${gatewayPort}/health`);
    assert.equal(health.status, 200);
    assert.equal(health.body.toString(), 'imli');
  } finally {
    await close(gateway);
    await close(editor);
    await close(imli);
  }
});

test('reserved health routes are private, no-store, method-limited, and keep nearby paths on Imli', async () => {
  let imliHits = 0;
  const imli = http.createServer((_request, response) => { imliHits++; response.end('imli'); });
  const imliPort = await listen(imli);
  const gateway = createGatewayServer({
    imliPort,
    health: {
      isAlive: () => true,
      getReadiness: async () => ({ ready: false, checks: { imli: false, api: true, worker: false, editorToken: true, running: true } }),
    },
  });
  const port = await listen(gateway);
  try {
    const live = await request(`http://127.0.0.1:${port}/__shared/live?ignored=1`);
    assert.equal(live.status, 200);
    assert.equal(live.headers['cache-control'], 'no-store');
    assert.deepEqual(JSON.parse(live.body.toString()), { alive: true });
    const head = await request(`http://127.0.0.1:${port}/__shared/ready`, { method: 'HEAD' });
    assert.equal(head.status, 503);
    assert.equal(head.body.length, 0);
    assert.equal(head.headers['cache-control'], 'no-store');
    const method = await request(`http://127.0.0.1:${port}/__shared/live`, { method: 'POST' });
    assert.equal(method.status, 405);
    assert.equal(method.headers.allow, 'GET, HEAD');
    const nearby = await request(`http://127.0.0.1:${port}/__shared/live-more`);
    assert.equal(nearby.body.toString(), 'imli');
    assert.equal(imliHits, 1);
  } finally {
    await close(gateway);
    await close(imli);
  }
});

test('health route reports stopping and does not reflect injected sensitive fields', async () => {
  const gateway = createGatewayServer({
    health: {
      isAlive: () => false,
      getReadiness: async () => ({ ready: false, checks: { api: false, worker: false }, token: 'secret', path: '/private', pid: 123 }),
    },
  });
  const port = await listen(gateway);
  try {
    const live = await request(`http://127.0.0.1:${port}/__shared/live`);
    assert.equal(live.status, 503);
    assert.deepEqual(JSON.parse(live.body.toString()), { alive: false });
    const ready = await request(`http://127.0.0.1:${port}/__shared/ready`);
    assert.equal(ready.status, 503);
    assert.deepEqual(JSON.parse(ready.body.toString()), { ready: false, checks: { api: false, worker: false } });
    assert.equal(ready.body.toString().includes('secret'), false);
    assert.equal(ready.body.toString().includes('/private'), false);
  } finally { await close(gateway); }
});
