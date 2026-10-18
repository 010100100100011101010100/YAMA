import "server-only";
import type { Dialogue } from "@/lib/dialogue";

// The worker owns generation; this stream observes owned state and never starts/retries a model call.
export function dialogueStream(initial: Dialogue, read: () => Promise<Dialogue>, signal: AbortSignal, authorize: () => Promise<boolean>) {
  const stopped = new AbortController(), encoder = new TextEncoder();
  const canceled = () => stopped.abort();
  signal.addEventListener("abort", canceled, { once: true });
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let previous = "", current = initial, checkedAt = Date.now();
      const deadline = Date.now() + 55_000;
      try {
        while (!signal.aborted && !stopped.signal.aborted && Date.now() < deadline) {
          if (Date.now() - checkedAt > 10_000) { if (!await authorize()) break; checkedAt = Date.now(); }
          const serialized = JSON.stringify(current);
          if (serialized !== previous) { controller.enqueue(encoder.encode(`event: dialogue\ndata: ${serialized}\n\n`)); previous = serialized; }
          await new Promise<void>(resolve => {
            const finish = () => { clearTimeout(timer); stopped.signal.removeEventListener("abort", finish); resolve(); };
            const timer = setTimeout(finish, 300);
            stopped.signal.addEventListener("abort", finish, { once: true });
          });
          if (!signal.aborted && !stopped.signal.aborted) current = await read();
        }
      } catch {
        if (!stopped.signal.aborted && !signal.aborted) controller.enqueue(encoder.encode('event: unavailable\ndata: {}\n\n'));
      } finally {
        signal.removeEventListener("abort", canceled);
        try { controller.close(); } catch { /* A disconnected consumer may already have canceled. */ }
      }
    },
    cancel() { stopped.abort(); signal.removeEventListener("abort", canceled); },
  });
  return new Response(body, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "private, no-store, no-transform", "X-Accel-Buffering": "no", "X-Content-Type-Options": "nosniff" } });
}
