// netlify/functions/rebuild.js — POST with header x-rebuild-token to build a fresh
// edition on demand. Like the scheduled function, this does not curate inline (that
// would exceed the 60s synchronous limit). It triggers the background worker and
// returns immediately; the new edition appears once the worker finishes (~1 min) and
// the reader is reloaded.
export default async function (req) {
  if (req.method !== "POST") return Response.json({ error: "POST only" }, { status: 405 });
  const token = process.env.REBUILD_TOKEN;
  if (!token || req.headers.get("x-rebuild-token") !== token)
    return Response.json({ error: "forbidden" }, { status: 403 });

  const base = process.env.URL || process.env.DEPLOY_PRIME_URL || "";
  try {
    await fetch(`${base}/.netlify/functions/curate-background`, { method: "POST" });
    return Response.json({ ok: true, status: "Building a fresh edition in the background. Reload in about a minute." });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
