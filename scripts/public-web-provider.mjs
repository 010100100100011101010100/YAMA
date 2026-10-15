// Isolated SDK process: never receives report data, cookies or database keys.
import { pathToFileURL } from "node:url";
const MAX_RESPONSE_BYTES = 262144;
export async function executePublicSDK(
  operation,
  payload,
  keys,
  transport = {},
) {
  let calls = 0;
  const signal = AbortSignal.timeout(10000);
  if (operation === "search_public_web") {
    if (
      !payload ||
      Object.keys(payload).sort().join(",") !== "domains,query" ||
      typeof payload.query !== "string" ||
      payload.query.length > 200 ||
      !Array.isArray(payload.domains) ||
      payload.domains.length > 4
    )
      throw new Error("invalid_request");
    const fetch = transport.fetch ?? globalThis.fetch;
    globalThis.fetch = async (value, options) => {
      if (
        ++calls > 1 ||
        String(value) !== "https://api.exa.ai/search" ||
        options.method !== "POST"
      )
        throw new Error("provider_destination_rejected");
      const response = await fetch(value, {
        ...options,
        signal,
        redirect: "error",
      });
      const reader = response.body?.getReader();
      if (!reader) throw new Error("provider_response_invalid");
      const chunks = [];
      let bytes = 0;
      while (true) {
        const packet = await reader.read();
        if (packet.done) break;
        bytes += packet.value.length;
        if (bytes > MAX_RESPONSE_BYTES) {
          await reader.cancel();
          throw new Error("provider_response_limit");
        }
        chunks.push(packet.value);
      }
      return new Response(Buffer.concat(chunks), {
        status: response.status,
        headers: { "Content-Type": "application/json" },
      });
    };
    // The SDK captures fetch at import time; this process owns the replacement.
    const { default: Exa } = await import("exa-js");
    const output = await new Exa(keys.exa, "https://api.exa.ai").search(
      payload.query,
      {
        type: "instant",
        contents: false,
        numResults: 3,
        includeDomains: payload.domains,
      },
    );
    return {
      results: output.results?.map((source) => ({
        url: source.url,
        title: source.title ?? null,
        publishedDate: source.publishedDate ?? null,
      })),
      costDollars: output.costDollars
        ? { total: output.costDollars.total }
        : null,
    };
  }
  if (
    operation !== "fetch_public_page" ||
    !payload ||
    Object.keys(payload).join(",") !== "html" ||
    typeof payload.html !== "string" ||
    Buffer.byteLength(payload.html) > 131072
  )
    throw new Error("invalid_request");
  const { default: axios } = await import("axios");
  const adapter = transport.axiosAdapter ?? axios.getAdapter("http");
  axios.defaults.adapter = async (config) => {
    const url = new URL(config.url, config.baseURL);
    if (
      ++calls > 1 ||
      url.href !== "https://api.firecrawl.dev/v2/parse" ||
      config.method !== "post"
    )
      throw new Error("provider_destination_rejected");
    return adapter({
      ...config,
      signal,
      proxy: false,
      maxRedirects: 0,
      maxContentLength: MAX_RESPONSE_BYTES,
      maxBodyLength: 200000,
      timeout: 10000,
    });
  };
  const { Firecrawl } = await import("firecrawl");
  // 4.46.0 loops `attempt < maxRetries`: 1 means one attempt, with no retry.
  const client = new Firecrawl({
    apiKey: keys.firecrawl,
    apiUrl: "https://api.firecrawl.dev",
    timeoutMs: 10000,
    maxRetries: 1,
  });
  const output = await client.parse(
    {
      data: payload.html,
      filename: "public-source.html",
      contentType: "text/html",
    },
    {
      formats: ["markdown"],
      onlyMainContent: true,
      timeout: 10000,
      parsers: [],
      skipTlsVerification: false,
      removeBase64Images: true,
      blockAds: true,
    },
  );
  return {
    markdown: output.markdown,
    metadata: {
      numPages: output.metadata?.numPages ?? 1,
      creditsUsed:
        output.metadata?.creditsUsed ??
        output.metadata?.provider?.creditsCost ??
        null,
    },
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  // All provider error text and diagnostics stay out of the IPC boundary.
  console.log = console.warn = console.info = console.error = () => undefined;
  try {
    if (
      process.env.NODE_ENV === "test" ||
      process.env.YAMA_DEMO_ONLY !== "true" ||
      process.env.YAMA_PUBLIC_WEB_LIVE_ENABLED !== "true" ||
      process.env.YAMA_PUBLIC_WEB_DATA_POLICY_ACKNOWLEDGED !== "true"
    )
      throw new Error("provider_disabled");
    const chunks = [];
    let bytes = 0;
    for await (const chunk of process.stdin) {
      bytes += chunk.length;
      if (bytes > 160000) throw new Error("input_limit");
      chunks.push(chunk);
    }
    const output = await executePublicSDK(
      process.argv[2],
      JSON.parse(Buffer.concat(chunks).toString("utf8")),
      {
        exa: process.env.EXA_API_KEY,
        firecrawl: process.env.FIRECRAWL_API_KEY,
      },
    );
    process.stdout.write(JSON.stringify(output));
  } catch {
    process.stdout.write(JSON.stringify({ error: "public_provider_failed" }));
    process.exitCode = 1;
  }
}
