/**
 * Gemini streaming client — uses the generateContent REST API with SSE streaming.
 * Translates Gemini's response format into plain text chunks.
 */
export async function* streamGemini(
  apiKey: string,
  prompt: string,
  model: string,
): AsyncGenerator<string> {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent` +
    `?alt=sse&key=${apiKey}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }], role: 'user' }],
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new GeminiError(res.status, text);
  }
  if (!res.body) throw new GeminiError(0, 'No response body');

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
      try {
        const data = JSON.parse(raw) as {
          candidates?: Array<{
            content?: { parts?: Array<{ text?: string }> };
            finishReason?: string;
          }>;
        };
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) yield text;
      } catch {
        // Malformed frame — skip.
      }
    }
  }
}

export class GeminiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(`Gemini error ${status}: ${message}`);
    this.name = 'GeminiError';
  }
}
