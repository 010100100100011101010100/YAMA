// SDK verification with fake transports, deliberately isolated from the app.
import assert from "node:assert/strict";
import { executePublicSDK } from "./public-web-provider.mjs";
const mode = process.argv[2];
let calls = 0;
if (mode === "search" || mode === "large-response") {
  let request;
  const fetch = async (url, options) => {
    calls++;
    request = { url, options, body: JSON.parse(options.body) };
    return new Response(
      mode === "large-response"
        ? "x".repeat(262145)
        : JSON.stringify({
            results: [
              {
                title: "Public source",
                url: "https://consumerhelpline.gov.in/",
              },
            ],
            costDollars: { total: 0.004 },
          }),
      { status: 200 },
    );
  };
  if (mode === "large-response")
    await assert.rejects(
      () =>
        executePublicSDK(
          "search_public_web",
          { query: "Public resource", domains: ["consumerhelpline.gov.in"] },
          { exa: "fake-exa-key" },
          { fetch },
        ),
      /provider_response_limit/,
    );
  else {
    const output = await executePublicSDK(
      "search_public_web",
      { query: "Public resource", domains: ["consumerhelpline.gov.in"] },
      { exa: "fake-exa-key" },
      { fetch },
    );
    // Exa serializes contents:false by omitting contents (its API opt-out).
    assert.equal(output.results.length, 1);
    assert.equal(request.options.redirect, "error");
    assert.deepEqual(request.body, {
      query: "Public resource",
      type: "instant",
      numResults: 3,
      includeDomains: ["consumerhelpline.gov.in"],
    });
  }
} else {
  const axiosAdapter = async (config) => {
    calls++;
    assert.equal(config.maxRedirects, 0);
    assert.equal(config.proxy, false);
    assert.equal(config.maxContentLength, 262144);
    assert.equal(
      new URL(config.url, config.baseURL).href,
      "https://api.firecrawl.dev/v2/parse",
    );
    const options = JSON.parse(config.data.get("options"));
    assert.deepEqual(options.formats, ["markdown"]);
    assert.equal(options.skipTlsVerification, false);
    assert.deepEqual(options.parsers, []);
    const html = await config.data.get("file").text();
    assert.equal(html, "<p>Public content.</p>");
    assert.equal(config.data.get("file").name, "public-source.html");
    if (mode === "parse-error") {
      const error = new Error("fake provider failure");
      error.response = {
        status: 502,
        data: { error: "fake provider failure" },
        headers: {},
      };
      throw error;
    }
    return {
      status: 200,
      statusText: "OK",
      headers: {},
      config,
      data: {
        success: true,
        data: {
          markdown: "Public content.",
          metadata: { sourceURL: "http://127.0.0.1/private", numPages: 1 },
        },
      },
    };
  };
  if (mode === "parse-error")
    await assert.rejects(() =>
      executePublicSDK(
        "fetch_public_page",
        { html: "<p>Public content.</p>" },
        { firecrawl: "fake-firecrawl-key" },
        { axiosAdapter },
      ),
    );
  else {
    const output = await executePublicSDK(
      "fetch_public_page",
      { html: "<p>Public content.</p>" },
      { firecrawl: "fake-firecrawl-key" },
      { axiosAdapter },
    );
    assert.equal(output.markdown, "Public content.");
    assert.equal(output.metadata.sourceURL, undefined);
  }
}
assert.equal(calls, 1);
process.stdout.write(
  JSON.stringify({ passed: true, requests: 1, network: false }),
);
