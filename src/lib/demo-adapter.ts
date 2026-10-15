// Only this explicit fixture adapter simulates work. There are no model or graph requests.
export async function runDemoComparison(signal: AbortSignal, fail: boolean): Promise<"ready" | "failed"> {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, 650);
    const abort = () => { clearTimeout(timer); reject(new DOMException("Canceled", "AbortError")); };
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
  });
  return fail ? "failed" : "ready";
}
