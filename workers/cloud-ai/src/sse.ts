/** Encode a single SSE frame. Always ends with double newline. */
function frame(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

/** Text chunk frame — matches the backend's SSE format. */
export function chunkFrame(text: string): string {
  return frame({ chunk: text });
}

/** Stream-done frame. */
export function doneFrame(): string {
  return frame({ done: true });
}

/** Error frame. */
export function errorFrame(message: string): string {
  return frame({ error: message });
}

/** Optional metadata frame (provider label, etc.). */
export function metaFrame(meta: Record<string, unknown>): string {
  return frame({ meta });
}

/**
 * Build a streaming Response from an async generator of SSE frames.
 * Uses TransformStream so the stream is truly lazy.
 */
export function sseResponse(gen: AsyncGenerator<string>): Response {
  const { readable, writable } = new TransformStream<string, Uint8Array>({
    transform(chunk, controller) {
      controller.enqueue(new TextEncoder().encode(chunk));
    },
  });

  // Pump the generator into the writable side in the background.
  (async () => {
    const writer = writable.getWriter();
    try {
      for await (const frame of gen) {
        await writer.write(frame);
      }
    } finally {
      await writer.close();
    }
  })();

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
