import { streamGroq } from './groq';
import { streamGemini } from './gemini';
import type { Env } from '../types';

export type ProviderLabel = 'groq' | 'gemini';

export interface ChainResult {
  stream: AsyncGenerator<string>;
  provider: ProviderLabel;
}

/**
 * Groq-first, Gemini-fallback provider chain.
 *
 * Tries Groq; on any non-2xx or network error falls through to Gemini.
 * The returned generator is already started — the first chunk determines
 * which provider succeeded. Throws if both fail.
 */
export async function resolveStream(env: Env, prompt: string, model?: string): Promise<ChainResult> {
  const groqModel = model ?? env.DEFAULT_GROQ_MODEL;
  const geminiModel = env.DEFAULT_GEMINI_MODEL;

  // Attempt Groq first.
  try {
    const stream = streamGroq(env.GROQ_API_KEY, prompt, groqModel);
    // Peek at the first chunk to confirm the stream works before committing.
    const peeked = await peekStream(stream);
    if (peeked !== null) {
      return { stream: prependStream(peeked, stream), provider: 'groq' };
    }
  } catch {
    // Fall through to Gemini.
  }

  // Gemini fallback.
  const stream = streamGemini(env.GEMINI_API_KEY, prompt, geminiModel);
  return { stream, provider: 'gemini' };
}

/**
 * Attempt to read the first value from an async generator.
 * Returns the value or null if the generator immediately ends.
 * Throws on error (allows the caller to fall through).
 */
async function peekStream(gen: AsyncGenerator<string>): Promise<string | null> {
  const { value, done } = await gen.next();
  if (done) return null;
  return value ?? null;
}

/**
 * Prepend an already-read value back in front of the rest of the generator.
 */
async function* prependStream(first: string, rest: AsyncGenerator<string>): AsyncGenerator<string> {
  yield first;
  yield* rest;
}
