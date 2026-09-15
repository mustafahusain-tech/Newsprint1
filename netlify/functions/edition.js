// netlify/functions/edition.js — GET today's edition (or newest on file) from Blobs.
import { getStore } from "@netlify/blobs";

export default async function () {
  try {
    const store = getStore("editions");
    const today = new Date().toISOString().slice(0, 10);

    let ed = await store.get(`edition-${today}`, { type: "json" });
    if (!ed) {
      ed = await store.get("latest", { type: "json" });
      if (ed) ed.stale = true;
    }
    if (!ed) {
      return Response.json(
        { error: "No edition has been built yet. Trigger the curate function." },
        { status: 503 }
      );
    }
    return Response.json(ed, { headers: { "Cache-Control": "public, max-age=300" } });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
