# Newsprint — Netlify deployment

A daily curated news reader for the classroom. Each morning a scheduled function
finds three real news stories, rewrites each at three reading levels (ages 8–10,
11–13, 14+), and generates a debate question, six comprehension questions, and a
glossary. Students write a summary; Claude marks it out of 10.

This version runs entirely on Netlify — static hosting for the reader, serverless
functions for the API, a scheduled function for the daily job, and Netlify Blobs
for storage (Netlify functions have no persistent disk, so the daily edition is
kept in Blobs rather than in a `data/` folder).

## Layout

    public/index.html                    The reader (static)
    netlify/functions/edition.js         GET /api/edition  → reads Blobs
    netlify/functions/mark.js            POST /api/mark     → Claude marks a summary
    netlify/functions/rebuild.js         POST /api/rebuild  → manual curate (token)
    netlify/functions/curate-scheduled.js  Daily cron → writes edition to Blobs
    lib/curate.js                        Shared curation engine
    netlify.toml                         Publish dir, redirects, cron schedule

## Deploy

You need a Netlify account, a GitHub account, and an Anthropic API key with web
search enabled.

1. **Push this folder to a GitHub repo** (private is fine). Don't commit anything
   secret — there's nothing secret in here; the key is set in Netlify, not the repo.

2. **Create the site.** In Netlify: **Add new site → Import an existing project →**
   pick your repo. Netlify reads `netlify.toml`, so build settings, functions, the
   redirects, and the cron schedule are all configured automatically. Click deploy.

3. **Set environment variables.** Site → **Site configuration → Environment
   variables**, add:
   - `ANTHROPIC_API_KEY` — your key (required)
   - `REBUILD_TOKEN` — any long random string (only needed for the in-app Rebuild
     button)
   - `ANTHROPIC_WORKSPACE_ID` — **only** if your key is workspace-scoped. If curation
     fails with a 400 saying it must include `anthropic-workspace-id`, set this to your
     workspace ID (find it in the Anthropic Console when viewing that workspace). If a
     plain, non-workspace-scoped key works, leave this unset.

   After adding them, trigger a redeploy (Deploys → Trigger deploy) so the
   functions pick them up.

4. **Enable Blobs.** On current Netlify accounts, Blobs is on by default and needs
   no setup — the functions use the site's store automatically. If you've disabled
   it, re-enable "Netlify Blobs" under Site configuration.

5. **Build the first edition.** The cron won't have run yet, so the reader will say
   no edition exists. Two ways to seed it now:
   - **Functions → `curate-background` → Run**, in the Netlify dashboard, or
   - open the site and press **Rebuild today**, entering your `REBUILD_TOKEN`.

   After ~30–60 seconds, reload the site and the edition appears.

From then on the scheduled function refreshes it daily at 05:30 UTC.


> **Plan note:** Background Functions are available on Netlify's Free, Personal, Pro,
> and Enterprise plans. If your account somehow lacks them, curation will fail to run;
> everything else (the reader, marking, streaks) still works.

## Local development

    npm install
    npm install -g netlify-cli    # if you don't have it
    export ANTHROPIC_API_KEY=sk-ant-...
    export REBUILD_TOKEN=dev-token
    netlify dev

`netlify dev` serves the static page, runs the functions, and provides a local
Blobs store, all on one port. Open the printed URL and press Rebuild today to seed.

## Netlify-specific caveats (worth knowing before it goes near a classroom)

- **The daily job runs as a Background Function** (`curate-background`), which Netlify
  allows to run for up to 15 minutes — enough for the news search plus the dozen model
  calls curation needs. The cron-triggered `curate-scheduled` function is only a
  lightweight trigger (scheduled functions themselves have a 30-second limit, and a
  synchronous function has 60 seconds — both too short to curate inline, which is why
  the work is offloaded to the background worker).
- **The in-app "Rebuild today" button** triggers the same background worker and
  returns immediately — it no longer risks a timeout. The fresh edition appears about a
  minute later; reload the page to see it. You can also trigger a build from the
  dashboard: Functions → `curate-background` → Run.
- **Summary marking** is a single quick model call and fits comfortably inside the
  function timeout. If it ever fails, the reader silently falls back to the
  built-in offline rule-based marker, so students are never blocked.

- **Cron is UTC.** 05:30 UTC is early morning UK. Adjust the `schedule` in
  `netlify.toml` if you want weekdays only (`30 5 * * 1-5`) or a different time.

- **Automated curation is not a safeguarding process.** The safety filter in
  `lib/curate.js` rejects stories that can't be told without graphic violence,
  injury detail, sexual content, self-harm methods, child abuse, or usable
  weapons/drugs detail — but a human editor should preview each edition before it's
  projected. Source links are in the sidebar for exactly this check.

## Changing age bands, sections, or the safety rules

Everything is in the constants at the top of `lib/curate.js`: `AUDIENCE`,
`SAFETY`, `SECTIONS`, and the `P_*` prompt builders. The reader adapts to whatever
the edition JSON contains, so you can change the number of stories or the question
mix without touching the front end.

## Reading streaks

Students build a streak by completing three tasks on any one story in a day: reading
it (opening the article), answering all its comprehension questions, and getting a
summary marked. Complete all three and the day is ticked off; do it on consecutive
days and the count climbs; miss a day and it starts again. A flame pill in the header
shows the current streak, and tapping it opens a panel with the last seven days and
today's remaining tasks.

Streaks are stored **only in the student's own browser** (localStorage). Nothing is
sent to the server, no account is needed, and no personal data is collected or
stored anywhere — which is deliberate, since the users are children. The practical
trade-offs: a streak lives on one device and one browser (it won't follow a student
from an iPad to a home laptop), and clearing site data or using private browsing
resets it. For a reading habit tracker aimed at motivation rather than assessment,
that's the right balance. Moving streaks server-side would mean identifying and
storing data about minors, which carries obligations (UK GDPR, the ICO Children's
Code) that a per-device tracker avoids entirely.
