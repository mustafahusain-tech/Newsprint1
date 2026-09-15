// netlify/functions/curate-background.js
// The `-background` suffix makes this a Netlify Background Function: it is invoked
// asynchronously (returns 202 immediately) and may run for up to 15 minutes — enough
// for the news search plus the dozen model calls curation needs. It writes the
// finished edition to Netlify Blobs. It is triggered by the scheduled function and by
// the manual rebuild function; it is not meant to be called directly by the browser.
import { getStore } from "@netlify/blobs";
import { curateEdition } from "../../lib/curate.js";

export default async function () {
  try {
    const edition = await curateEdition();
    const store = getStore("editions");
    await store.setJSON(`edition-${edition.date}`, edition);
    await store.setJSON("latest", edition);
    console.log(`Curated ${edition.stories.length} stories for ${edition.date}`);
  } catch (e) {
    console.error("Curation failed:", e.message);
    // Throwing lets Netlify record the failure and retry (1 min, then 2 min later).
    throw e;
  }
}
