// lib/curate.js — shared curation engine. Produces one edition object.
// Used by the scheduled function and the manual-rebuild function.
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-sonnet-4-6";
const AUDIENCE = "UK secondary school students aged 11 to 16";
const SAFETY = `A story must be REJECTED if telling it accurately would require: graphic violence, injury or death detail; sexual content; description of suicide, self-harm or eating-disorder methods; abuse of children; or usable detail about weapons or drugs. Serious subjects such as war, elections, crime, disasters and climate ARE allowed when they can be told factually without those elements.`;

const SECTIONS = [
  { label: "world affairs or society", motif: "dots" },
  { label: "science, technology or the environment", motif: "waves" },
  { label: "culture, history or sport", motif: "jars" },
];

function client() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");
  return new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    ...(process.env.ANTHROPIC_WORKSPACE_ID
      ? { defaultHeaders: { "anthropic-workspace-id": process.env.ANTHROPIC_WORKSPACE_ID } }
      : {}),
  });
}

async function ask(c, prompt, useSearch) {
  const req = { model: MODEL, max_tokens: 1500, messages: [{ role: "user", content: prompt }] };
  if (useSearch) req.tools = [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }];
  const msg = await c.messages.create(req);
  const text = msg.content.filter(b => b.type === "text").map(b => b.text).join("\n").trim();
  if (!text) throw new Error("model returned no text (stop_reason: " + msg.stop_reason + ")");
  return text;
}
function toJSON(txt) {
  let t = txt.replace(/```json|```/g, "").trim();
  const s = t.search(/[[{]/); if (s > 0) t = t.slice(s);
  const e = Math.max(t.lastIndexOf("]"), t.lastIndexOf("}"));
  if (e > -1) t = t.slice(0, e + 1);
  return JSON.parse(t);
}
async function askJSON(c, prompt, useSearch, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) {
    try { return toJSON(await ask(c, prompt, useSearch)); }
    catch (e) { last = e; }
  }
  throw last;
}

const P_CURATE = dateStr => `You are the editor of a daily news publication for ${AUDIENCE}. Today is ${dateStr}.

Use web search to find the three most significant REAL news stories published in the last 48 hours. Pick a spread: one world affairs or society story, one science, technology or environment story, and one culture, history or sport story. Prefer established news organisations.

${SAFETY}

Everything you write must be verifiable from the sources you found. Invent nothing.

Return ONLY a JSON array, no markdown fences and no commentary:
[{"kicker":"Section · Topic","tab":"three to six word label","motif":"waves|dots|jars","brief":"90 to 120 words of verified fact: what happened, when, where, who is involved, why it matters. Facts only, no opinion.","sources":[{"name":"Publisher","url":"https://..."}]}]

Give two sources per story where you can. Use motif "waves" for science, nature or environment, "dots" for technology, politics or society, "jars" for history, culture or sport.`;

const P_CURATE_ONE = (dateStr, sec) => `Today is ${dateStr}. Use web search to find ONE significant real news story about ${sec.label}, published in the last 48 hours, suitable for ${AUDIENCE}. Prefer established news organisations.

${SAFETY}

Everything must be verifiable from the source you found. Invent nothing.

Return ONLY JSON, no fences:
{"kicker":"Section · Topic","tab":"three to six word label","brief":"90 to 120 words of verified fact: what happened, when, where, who, why it matters. Facts only.","sources":[{"name":"Publisher","url":"https://..."}]}`;

const P_LEVEL = (brief, lv) => {
  const spec = [
    `LEVEL 1, reading age 8 to 10. About 110 words. Short sentences, one idea each. Everyday vocabulary. No subordinate clauses where a full stop will do.`,
    `LEVEL 2, reading age 11 to 13. About 145 words. Mixed sentence lengths. Subject vocabulary allowed if it is explained in context.`,
    `LEVEL 3, reading age 14 and above. About 185 words. Analytical, assumes background knowledge, weighs cause and implication rather than only reporting sequence.`,
  ][lv];
  return `Rewrite this news brief for school students at one reading level. Use ONLY facts present in the brief. Add nothing, invent nothing, and never distort a fact to make it simpler.

${spec}

Write a headline pitched at the same level. British English. Three or four paragraphs.

BRIEF:
${brief}

Return ONLY JSON, no fences: {"headline":"...","paragraphs":["...","...","..."]}`;
};

const P_ASSESS = brief => `From this news brief, write classroom assessment material for ${AUDIENCE}. Use only what is in the brief.

BRIEF:
${brief}

Return ONLY JSON, no fences:
{"glossary":[["Term","one clear sentence defining it"],["Term","..."],["Term","..."]],
"question":{"text":"a genuinely arguable question arising from this story, answerable yes or no","yes":"the strongest short case for","no":"the strongest short case against"},
"quiz":[{"type":"Retrieve","q":"...","o":["...","...","..."],"a":0,"why":"one sentence explaining the answer"}]}

The quiz must contain exactly six questions, in this order of type: Retrieve, Retrieve, Vocabulary, Infer, Infer, Evaluate. "a" is the index of the correct option. Vary which index is correct. Wrong options must be plausible, not silly. Evaluate questions ask which statement is best supported by the story, never for a personal opinion.`;

async function buildStory(c, p) {
  const [l0, l1, l2, asmt] = await Promise.all([
    askJSON(c, P_LEVEL(p.brief, 0)), askJSON(c, P_LEVEL(p.brief, 1)),
    askJSON(c, P_LEVEL(p.brief, 2)), askJSON(c, P_ASSESS(p.brief)),
  ]);
  return {
    kicker: p.kicker, tab: p.tab, motif: ["waves", "dots", "jars"].includes(p.motif) ? p.motif : "dots",
    sources: p.sources || [],
    levels: [{ age: "8–10", ...l0 }, { age: "11–13", ...l1 }, { age: "14+", ...l2 }],
    glossary: asmt.glossary || [], q: asmt.question, quiz: asmt.quiz || [],
  };
}

export async function curateEdition() {
  const c = client();
  const dateStr = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const dateKey = new Date().toISOString().slice(0, 10);

  let picks;
  try {
    picks = await askJSON(c, P_CURATE(dateStr), true, 2);
  } catch (e1) {
    const settled = await Promise.allSettled(SECTIONS.map(sec => askJSON(c, P_CURATE_ONE(dateStr, sec), true, 3)));
    picks = settled.map((r, i) => r.status === "fulfilled" ? { ...r.value, motif: SECTIONS[i].motif } : null).filter(Boolean);
    if (!picks.length) throw e1;
  }
  picks = picks.slice(0, 3);

  const stories = [];
  for (const p of picks) {
    try { stories.push(await buildStory(c, p)); } catch { /* skip a story that fails to write */ }
  }
  if (!stories.length) throw new Error("no stories survived the writing stage");

  return { date: dateKey, dateLabel: dateStr, builtAt: new Date().toISOString(), stories };
}
