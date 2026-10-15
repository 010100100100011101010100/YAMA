// Real auth setup respects Better Auth's sign-in window; never disable it for tests.
export async function anonymousSignIn(origin: string): Promise<Response> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(`${origin}/api/auth/sign-in/anonymous`, { method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" }, body: "{}" });
    if (response.status !== 429 || attempt === 2) return response;
    const seconds = Number(response.headers.get("retry-after") ?? response.headers.get("x-retry-after"));
    if (!Number.isInteger(seconds) || seconds < 1 || seconds > 10) return response;
    await response.body?.cancel();
    await new Promise(resolve => setTimeout(resolve, seconds * 1000));
  }
  throw new Error("Anonymous fixture session unavailable");
}
