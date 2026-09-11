export default {
  async fetch(request, env) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: { Allow: "GET, HEAD" },
      });
    }

    const url = new URL(request.url);

    let key;
    try {
      key = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
    } catch {
      return new Response("Bad Request", { status: 400 });
    }

    // Expose only individual M4A clips and immutable, versioned manifests.
    // No listing, mutable "latest" pointer, or other bucket prefixes.
    const isClip = /^clips\/[a-zA-Z0-9][a-zA-Z0-9._-]*\.m4a$/.test(key);
    const isManifest = /^manifest\/v[1-9][0-9]*\.json$/.test(key);
    if (!isClip && !isManifest) {
      return new Response("Not Found", { status: 404 });
    }

    const rangeRequested = request.headers.has("Range");
    const object =
      request.method === "HEAD"
        ? await env.MEDIA.head(key)
        : await env.MEDIA.get(
            key,
            rangeRequested ? { range: request.headers } : undefined,
          );

    if (object === null) {
      return new Response("Not Found", { status: 404 });
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("ETag", object.httpEtag);
    headers.set("Accept-Ranges", "bytes");
    headers.set("X-Content-Type-Options", "nosniff");

    if (!headers.has("Content-Type")) {
      headers.set(
        "Content-Type",
        isManifest ? "application/json; charset=utf-8" : "audio/mp4",
      );
    }

    if (!headers.has("Cache-Control")) {
      headers.set(
        "Cache-Control",
        "public, max-age=31536000, immutable",
      );
    }

    if (request.method === "HEAD") {
      headers.set("Content-Length", String(object.size));
      return new Response(null, { status: 200, headers });
    }

    if (!("body" in object)) {
      return new Response(null, { status: 412, headers });
    }

    let status = 200;

    if (
      rangeRequested &&
      object.range &&
      typeof object.range.offset === "number" &&
      typeof object.range.length === "number"
    ) {
      const start = object.range.offset;
      const end = start + object.range.length - 1;
      headers.set("Content-Range", `bytes ${start}-${end}/${object.size}`);
      headers.set("Content-Length", String(object.range.length));
      status = 206;
    }

    return new Response(object.body, { status, headers });
  },
};
