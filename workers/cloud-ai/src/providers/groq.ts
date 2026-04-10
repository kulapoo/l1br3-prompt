/**
 * Groq streaming client — OpenAI-compatible chat completions API.
 * Yields text chunks as they arrive from the SSE stream.
 */
export async function* streamGroq(
  apiKey: string,
  prompt: string,
  model: string,
): AsyncGenerator<string> {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      stream: true,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new GroqError(res.status, text);
  }
  if (!res.body) throw new GroqError(0, 'No response body');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const raw = line.slice(6).trim();
      if (raw === '[DONE]') return;
      try {
        const data = JSON.parse(raw) as {
          choices?: Array<{ delta?: { content?: string }; finish_reason?: string | null }>;
        };
        const content = data.choices?.[0]?.delta?.content;
        if (content) yield content;
      } catch {
        // Malformed frame — skip.
      }
    }
  }
}

export class GroqError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(`Groq error ${status}: ${message}`);
    this.name = 'GroqError';
  }
}
