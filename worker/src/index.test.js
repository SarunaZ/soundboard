import assert from "node:assert/strict";
import test from "node:test";

import worker from "./index.ts";

function media(body = "ok") {
  const requested = [];
  const getOptions = [];
  const bytes = new TextEncoder().encode(body);
  const object = {
    body: bytes,
    httpEtag: '"test-etag"',
    size: bytes.byteLength,
    writeHttpMetadata() {},
  };

  return {
    requested,
    getOptions,
    binding: {
      async get(key, options) {
        requested.push(key);
        getOptions.push(options);
        return object;
      },
      async head(key) {
        requested.push(key);
        return object;
      },
    },
  };
}

test("serves a content-addressed clip", async () => {
  const store = media("audio");
  const response = await worker.fetch(
    new Request("https://example.test/clips/abc123.m4a"),
    { MEDIA: store.binding },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(store.requested, ["clips/abc123.m4a"]);
  assert.deepEqual(store.getOptions, [undefined]);
  assert.equal(response.headers.get("content-type"), "audio/mp4");
});

test("serves an immutable versioned manifest", async () => {
  const store = media('{"version":1}');
  const response = await worker.fetch(
    new Request("https://example.test/manifest/v1.json"),
    { MEDIA: store.binding },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(store.requested, ["manifest/v1.json"]);
  assert.deepEqual(store.getOptions, [undefined]);
  assert.equal(response.headers.get("content-type"), "application/json; charset=utf-8");
  assert.equal(response.headers.get("cache-control"), "public, max-age=31536000, immutable");
});

test("rejects mutable manifests and unrelated bucket keys", async () => {
  for (const path of ["/manifest/latest.json", "/manifest/v0.json", "/db/backup.sqlite"]) {
    const store = media();
    const response = await worker.fetch(
      new Request("https://example.test" + path),
      { MEDIA: store.binding },
    );

    assert.equal(response.status, 404);
    assert.deepEqual(store.requested, []);
  }
});

test("rejects methods other than GET and HEAD", async () => {
  const store = media();
  const response = await worker.fetch(
    new Request("https://example.test/clips/abc123.m4a", { method: "POST" }),
    { MEDIA: store.binding },
  );

  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "GET, HEAD");
  assert.deepEqual(store.requested, []);
});
