// netlify/functions/mark.js — POST { story, summary } → Claude's mark out of 10.
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-sonnet-4-6";
const P_MARK = (story, summary) => `A student has summarised a news story. Mark their summary out of 10.

STORY THEY READ:
${story}

THEIR SUMMARY:
${summary}

Judge: accuracy (nothing wrong or invented), key points (the main event and why it matters), own words (copying sentences from the story scores low), concision (tight, no padding).

Be honest but encouraging, and address the student directly as "you". Keep each piece of feedback to one sentence, and make the improvement specific to what they actually wrote.

Return ONLY JSON, no fences:
{"score":7,"criteria":[{"name":"Accuracy","mark":8},{"name":"Key points","mark":7},{"name":"Own words","mark":6},{"name":"Concision","mark":7}],"good":"...","improve":"..."}`;

export default async function (req) {
  if (req.method !== "POST") return Response.json({ error: "POST only" }, { status: 405 });
  if (!process.env.ANTHROPIC_API_KEY)
    return Response.json({ error: "Server has no API key; front end will mark offline." }, { status: 503 });

  let body;
  try { body = await req.json(); } catch { return Response.json({ error: "invalid JSON" }, { status: 400 }); }
  const { story, summary } = body || {};
  if (!story || !summary) return Response.json({ error: "story and summary are required" }, { status: 400 });

  try {
    const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    ...(process.env.ANTHROPIC_WORKSPACE_ID
      ? { defaultHeaders: { "anthropic-workspace-id": process.env.ANTHROPIC_WORKSPACE_ID } }
      : {}),
  });
    const msg = await client.messages.create({
      model: MODEL, max_tokens: 700,
      messages: [{ role: "user", content: P_MARK(String(story).slice(0, 6000), String(summary).slice(0, 3000)) }],
    });
    let t = msg.content.filter(b => b.type === "text").map(b => b.text).join("\n").replace(/```json|```/g, "").trim();
    const s = t.search(/[[{]/); if (s > 0) t = t.slice(s);
    const e = t.lastIndexOf("}"); if (e > -1) t = t.slice(0, e + 1);
    return Response.json(JSON.parse(t));
  } catch (e) {
    return Response.json({ error: e.message }, { status: 502 });
  }
}
