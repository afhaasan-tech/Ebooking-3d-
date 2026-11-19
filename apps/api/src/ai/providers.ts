import { config } from '../config';

/**
 * Optional LLM providers. The platform works fully without them (AI_PROVIDER=none).
 * Keys live only in server env vars; nothing here is exposed to the browser.
 * LLM output is treated as untrusted text and always validated before use.
 */
export interface LlmProvider {
  readonly name: string;
  complete(system: string, user: string, opts?: { maxTokens?: number; json?: boolean }): Promise<string>;
}

async function withTimeout<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), config.aiTimeoutMs);
  try {
    return await fn(ac.signal);
  } finally {
    clearTimeout(t);
  }
}

class ClaudeProvider implements LlmProvider {
  name = 'claude';
  async complete(system: string, user: string, opts: { maxTokens?: number } = {}) {
    return withTimeout(async (signal) => {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal,
        headers: { 'content-type': 'application/json', 'x-api-key': config.aiApiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: config.aiModel || 'claude-haiku-5-5', max_tokens: opts.maxTokens ?? 400, system, messages: [{ role: 'user', content: user }] }),
      });
      if (!r.ok) throw new Error(`claude_http_${r.status}`);
      const j: any = await r.json();
      return String(j.content?.[0]?.text ?? '');
    });
  }
}

class OpenAIProvider implements LlmProvider {
  name = 'openai';
  async complete(system: string, user: string, opts: { maxTokens?: number; json?: boolean } = {}) {
    return withTimeout(async (signal) => {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        signal,
        headers: { 'content-type': 'application/json', authorization: `Bearer ${config.aiApiKey}` },
        body: JSON.stringify({ model: config.aiModel || 'gpt-4o-mini', max_tokens: opts.maxTokens ?? 400, response_format: opts.json ? { type: 'json_object' } : undefined, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
      });
      if (!r.ok) throw new Error(`openai_http_${r.status}`);
      const j: any = await r.json();
      return String(j.choices?.[0]?.message?.content ?? '');
    });
  }
}

class GeminiProvider implements LlmProvider {
  name = 'gemini';
  async complete(system: string, user: string, opts: { maxTokens?: number; json?: boolean } = {}) {
    return withTimeout(async (signal) => {
      const model = config.aiModel || 'gemini-2.0-flash';
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        signal,
        headers: { 'content-type': 'application/json', 'x-goog-api-key': config.aiApiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: user }] }],
          generationConfig: { maxOutputTokens: opts.maxTokens ?? 400, responseMimeType: opts.json ? 'application/json' : 'text/plain' },
        }),
      });
      if (!r.ok) throw new Error(`gemini_http_${r.status}`);
      const j: any = await r.json();
      return String(j.candidates?.[0]?.content?.parts?.[0]?.text ?? '');
    });
  }
}

export function getLlm(): LlmProvider | null {
  if (config.aiProvider === 'none' || !config.aiApiKey) return null;
  return config.aiProvider === 'claude' ? new ClaudeProvider() : config.aiProvider === 'openai' ? new OpenAIProvider() : new GeminiProvider();
}

/** Simple per-key usage budget (requests per hour). */
export class UsageBudget {
  private hits = new Map<string, number[]>();
  constructor(private readonly perHour: number) {}
  take(key: string): boolean {
    const now = Date.now();
    const arr = (this.hits.get(key) ?? []).filter((t) => now - t < 3600_000);
    if (arr.length >= this.perHour) {
      this.hits.set(key, arr);
      return false;
    }
    arr.push(now);
    this.hits.set(key, arr);
    return true;
  }
}
