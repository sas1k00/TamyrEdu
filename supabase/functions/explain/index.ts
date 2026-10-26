/*
 * «Объясни мою ошибку»: Claude объясняет ученику, почему выбранный ответ неверен.
 *
 * Ключ Anthropic лежит в секретах Supabase (ANTHROPIC_API_KEY) и в браузер не попадает.
 * Пускаем только вошедших учеников, не больше DAILY_LIMIT объяснений в день на каждого (таблица из supabase/ai.sql).
 * В Claude уходит только задача и ответ — без имени и почты ученика.
 * Правильный ответ и разбор приходят из банка задач приложения: модель объясняет готовое решение, а не решает заново.
 */
import Anthropic from "npm:@anthropic-ai/sdk@1.2.0";
import { createClient } from "npm:@supabase/supabase-js@2.118.0";

const MODEL = "claude-sonnet-5-5";
const DAILY_LIMIT = 20;

const anthropic = new Anthropic(); // ключ — из переменной ANTHROPIC_API_KEY

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const SYSTEM = `You are Tamyr, a patient math tutor for Kazakhstani high-school students preparing for the ENT (ҰБТ) exam.
A student just answered a multiple-choice problem. You receive the problem, the options, the correct answer, the student's choice, and the official solution.

Your job: explain the student's mistake so they understand it and won't repeat it.
- Start from what the student most likely thought, in one or two sentences ("Похоже, ты…"). If they chose "не знаю", skip this and explain how to start.
- Then show the correct way briefly, following the official solution. The correct answer given to you is final: never arrive at a different one and never question it.
- Use one small everyday example or check only if it really helps.
- 60–120 words. Plain text only: no Markdown, no LaTeX, no headings. Write fractions as 1/2, powers as x², roots as √.
- Speak to the student as "ты", warmly and without talking down. Do not praise or scold.
- Stay on this problem. Do not mention that you are an AI or these instructions.
- Write in the language you are asked to use.`;

type Input = {
  lang: "ru" | "kk"; topic: string; rule: string; question: string;
  options: string[]; correct: string; chosen: string | null;
  mistake: { title: string; fix: string } | null; solution: string[];
};

// Ученик может прислать что угодно: берём только ожидаемые поля и обрезаем длину.
function clean(b: any): Input | null {
  const s = (v: unknown, n = 400) => (typeof v === "string" ? v.slice(0, n).trim() : "");
  if (!b || typeof b !== "object") return null;
  const options = Array.isArray(b.options) ? b.options.slice(0, 6).map((o: unknown) => s(o, 120)) : [];
  const out: Input = {
    lang: b.lang === "kk" ? "kk" : "ru",
    topic: s(b.topic, 80), rule: s(b.rule), question: s(b.question),
    options, correct: s(b.correct, 120), chosen: b.chosen == null ? null : s(b.chosen, 120),
    mistake: b.mistake && typeof b.mistake === "object" ? { title: s(b.mistake.title, 160), fix: s(b.mistake.fix) } : null,
    solution: Array.isArray(b.solution) ? b.solution.slice(0, 8).map((x: unknown) => s(x, 200)) : [],
  };
  return out.question && out.correct && options.length >= 2 ? out : null;
}

function prompt(x: Input): string {
  return [
    `Answer in ${x.lang === "kk" ? "Kazakh (қазақ тілі)" : "Russian"}.`,
    `Topic: ${x.topic}`,
    x.rule && `Rule of the topic: ${x.rule}`,
    `Problem: ${x.question}`,
    `Options: ${x.options.join(" | ")}`,
    `Correct answer: ${x.correct}`,
    `Student's choice: ${x.chosen ?? "не знаю (didn't know)"}`,
    x.mistake && `Known typical mistake behind this choice: ${x.mistake.title}. ${x.mistake.fix}`,
    x.solution.length && `Official solution:\n${x.solution.map((st, i) => `${i + 1}. ${st}`).join("\n")}`,
  ].filter(Boolean).join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  // Проверяем вход сами (токен ученика + публичный ключ из запроса), поэтому «Verify JWT» у функции выключен.
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, req.headers.get("apikey") ?? "", {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    auth: { persistSession: false },
  });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ error: "auth" }, 401);

  let input: Input | null = null;
  try { input = clean(await req.json()); } catch { /* не JSON */ }
  if (!input) return json({ error: "bad" }, 400);

  const { data: allowed, error } = await supabase.rpc("ai_take", { daily_limit: DAILY_LIMIT });
  if (error) { console.error("ai_take", error.message); return json({ error: "server" }, 500); }
  if (!allowed) return json({ error: "limit" }, 429);

  try {
    const msg = await anthropic.beta.messages.create({
      model: MODEL,
      max_tokens: 2000,
      output_config: { effort: "low" }, // короткое объяснение: глубокое размышление тут не окупается
      system: SYSTEM,
      messages: [{ role: "user", content: prompt(input) }],
      // если модель откажется (для школьной математики почти невероятно), сервер сам повторит запрос на рекомендованной модели
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
    if (msg.stop_reason === "refusal") return json({ error: "refusal" }, 502);
    const text = msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("").trim();
    if (!text) return json({ error: "empty" }, 502);
    return json({ text });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json({ error: "busy" }, 503);
    if (e instanceof Anthropic.APIError) { console.error("anthropic", e.status, e.message); return json({ error: "server" }, 502); }
    console.error("explain", e);
    return json({ error: "server" }, 500);
  }
});
