// netlify/functions/curate-scheduled.js
// Runs on the cron in netlify.toml. Scheduled functions have only a 30-second limit,
// so this one does no work itself — it just fires the long-running background worker
// and returns. The worker (curate-background) does the actual curation.
export default async function (req) {
  const base = process.env.URL || process.env.DEPLOY_PRIME_URL || "";
  try {
    // Fire-and-forget: invoke the background function's endpoint. It returns 202 at once.
    await fetch(`${base}/.netlify/functions/curate-background`, { method: "POST" });
    console.log("Triggered curate-background");
  } catch (e) {
    console.error("Could not trigger curate-background:", e.message);
  }
  return new Response("triggered");
}
