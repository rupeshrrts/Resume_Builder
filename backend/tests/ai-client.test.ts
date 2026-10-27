import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyResume } from "@resume/shared/schema/resume";
import { aiModel, aiProvider, aiProviders, extractJson } from "@/ai/client";
import { rewriteBullet } from "@/ai/tasks";

/** Sets exactly the given AI keys (everything else empty). */
function keys(set: Partial<Record<"ANTHROPIC_API_KEY" | "OPENAI_API_KEY" | "GEMINI_API_KEY" | "GROQ_API_KEY" | "NVIDIA_API_KEY" | "AI_PROVIDER", string>>) {
  for (const k of ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY", "GROQ_API_KEY", "NVIDIA_API_KEY", "AI_PROVIDER", "NVIDIA_MODEL", "GEMINI_MODEL", "GROQ_MODEL", "OPENAI_MODEL", "AI_MAX_TOKENS"] as const)
    vi.stubEnv(k, set[k as keyof typeof set] ?? "");
}

describe("AI provider selection", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is off without keys", () => {
    keys({});
    expect(aiProvider()).toBeNull();
  });

  it("uses whichever key is set, with that service's default model", () => {
    keys({ NVIDIA_API_KEY: "nvapi-test" });
    expect([aiProvider(), aiModel()]).toEqual(["nvidia", "deepseek-ai/deepseek-v4.1-flash"]);
    keys({ GEMINI_API_KEY: "g-test" });
    expect([aiProvider(), aiModel()]).toEqual(["gemini", "gemini-3.8-flash"]);
    keys({ GROQ_API_KEY: "gsk-test" });
    expect([aiProvider(), aiModel()]).toEqual(["groq", "openai/gpt-oss-120b"]);
    keys({ OPENAI_API_KEY: "sk-test" });
    expect([aiProvider(), aiModel()]).toEqual(["openai", "gpt-6-luna"]);
  });

  it("tries paid services first, then the free ones, and AI_PROVIDER moves one to the front", () => {
    keys({ ANTHROPIC_API_KEY: "a", OPENAI_API_KEY: "o", GEMINI_API_KEY: "g", GROQ_API_KEY: "q", NVIDIA_API_KEY: "n" });
    expect(aiProviders()).toEqual(["anthropic", "openai", "gemini", "groq", "nvidia"]);
    keys({ GEMINI_API_KEY: "g", NVIDIA_API_KEY: "n", AI_PROVIDER: "nvidia" });
    expect(aiProviders()).toEqual(["nvidia", "gemini"]);
  });
});

describe("free-plan fallback", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  const ok = {
    alternatives: [{ style: "balanced", text: "Built APIs in Node.js for the reporting team", why: "Starts with a strong verb." }],
    questions: [],
    already_strong: false,
  };
  const input = { bullet: "Made APIs in Node.js for reporting team", context: "Software Engineer at Acme", siblings: [], resume: emptyResume(), jobTerms: [], preferredStyle: "balanced" as const, facts: "" };
  const okReply = () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(ok) }, finish_reason: "stop" }] }), { status: 200 });

  const sentModel = (call: unknown[]) => JSON.parse(String((call[1] as RequestInit).body)).model;
  const busy = () => new Response(JSON.stringify({ error: { code: 503, message: "This model is currently experiencing high demand." } }), { status: 503 });

  it("tries the service's backup model when the main one is overloaded", async () => {
    keys({ GEMINI_API_KEY: "g-test" });
    const fetchMock = vi.fn().mockResolvedValueOnce(busy()).mockResolvedValueOnce(okReply());
    vi.stubGlobal("fetch", fetchMock);
    expect((await rewriteBullet(input)).alternatives).toHaveLength(1);
    expect(fetchMock.mock.calls.map(sentModel)).toEqual(["gemini-3.8-flash", "gemini-3.6-flash"]);
  });

  it("moves on to the next service when all of one service's models are busy", async () => {
    keys({ GEMINI_API_KEY: "g-test", GROQ_API_KEY: "gsk-test" });
    const fetchMock = vi.fn().mockResolvedValueOnce(busy()).mockResolvedValueOnce(new Response("{}", { status: 429 })).mockResolvedValueOnce(busy()).mockResolvedValueOnce(okReply());
    vi.stubGlobal("fetch", fetchMock);
    expect((await rewriteBullet(input)).alternatives).toHaveLength(1);
    expect(fetchMock.mock.calls.map(sentModel)).toEqual(["gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.5-flash-lite", "openai/gpt-oss-120b"]);
    expect(String(fetchMock.mock.calls[3][0])).toBe("https://api.groq.com/openai/v1/chat/completions");
  });

  it("treats an OpenAI account without credit as unavailable (not busy) and uses the free service", async () => {
    keys({ OPENAI_API_KEY: "sk-test", GEMINI_API_KEY: "g-test" });
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: "insufficient_quota" } }), { status: 429 })).mockResolvedValueOnce(okReply());
    vi.stubGlobal("fetch", fetchMock);
    expect((await rewriteBullet(input)).alternatives).toHaveLength(1);
    const openaiBody = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(openaiBody.max_completion_tokens).toBeGreaterThan(0);
    expect(openaiBody).not.toHaveProperty("temperature");
  });

  it("tells the user plainly when the only service has no credit", async () => {
    keys({ OPENAI_API_KEY: "sk-test" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { code: "insufficient_quota" } }), { status: 429 })));
    await expect(rewriteBullet(input)).rejects.toThrow(/isn't available right now/);
  });
});

describe("NVIDIA provider, end to end with a simulated reply", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  const reply = (content: string) =>
    new Response(JSON.stringify({ model: "deepseek-ai/deepseek-v4.1-flash", choices: [{ message: { content }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 20 } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  const good = {
    alternatives: [
      { style: "conservative", text: "Built APIs in Node.js for the reporting team", why: "Starts with a strong verb." },
      { style: "balanced", text: "Built REST APIs in Node.js that the reporting team used daily", why: "Adds who benefited." },
      { style: "achievement", text: "Cut report time by 40% by building REST APIs in Node.js", why: "Leads with the result." },
    ],
    questions: ["How many APIs did you build?"],
    already_strong: false,
  };
  const input = { bullet: "Made APIs in Node.js for reporting team", context: "Software Engineer at Acme", siblings: [], resume: emptyResume(), jobTerms: [], preferredStyle: "balanced" as const, facts: "" };

  it("sends an OpenAI-style request to NVIDIA and returns checked suggestions", async () => {
    keys({ NVIDIA_API_KEY: "nvapi-test" });
    const fetchMock = vi.fn(async () => reply("Sure! Here it is:\n```json\n" + JSON.stringify(good) + "\n```"));
    vi.stubGlobal("fetch", fetchMock);

    const out = await rewriteBullet(input);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://integrate.api.nvidia.com/v1/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer nvapi-test");
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe("deepseek-ai/deepseek-v4.1-flash");
    expect(body.messages[0].content).toContain("JSON schema");
    expect(out.alternatives).toHaveLength(3);
    expect(out.questions).toEqual(["How many APIs did you build?"]);
    // The made-up "40%" is caught by the fact guard; the others pass.
    expect(out.alternatives.find((a) => a.style === "achievement")!.guard.ok).toBe(false);
    expect(out.alternatives.find((a) => a.style === "conservative")!.guard.ok).toBe(true);
  });

  it("retries once when the model's first reply isn't valid JSON", async () => {
    keys({ NVIDIA_API_KEY: "nvapi-test" });
    const fetchMock = vi.fn().mockResolvedValueOnce(reply("I can't format that, sorry.")).mockResolvedValueOnce(reply(JSON.stringify(good)));
    vi.stubGlobal("fetch", fetchMock);
    expect((await rewriteBullet(input)).alternatives).toHaveLength(3);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("explains a rejected key and a busy service in plain words", async () => {
    keys({ NVIDIA_API_KEY: "nvapi-bad" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 401 })));
    await expect(rewriteBullet(input)).rejects.toThrow(/isn't available right now/);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 429 })));
    await expect(rewriteBullet(input)).rejects.toThrow(/busy/);
  });
});

describe("extractJson", () => {
  it("strips reasoning, fences and surrounding text", () => {
    expect(JSON.parse(extractJson('<think>plan</think>\nHere you go:\n```json\n{"a": {"b": 1}}\n```\nDone.'))).toEqual({ a: { b: 1 } });
  });
  it("leaves plain JSON untouched", () => {
    expect(extractJson('{"ok":true}')).toBe('{"ok":true}');
  });
});
