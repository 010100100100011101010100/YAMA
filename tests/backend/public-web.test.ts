import { describe, expect, it, vi } from "vitest";
import {
  assertPublicURL,
  isPublicAddress,
  PUBLIC_TOPICS,
} from "@/server/public-web/policy";
import {
  fetchPublicHTML,
  checkedAddress,
  sanitizePublicHTML,
  type PageRequest,
} from "@/server/public-web/network";
import { publicWebSettings } from "@/server/public-web/config";

describe("public-source network boundary", () => {
  const topic = PUBLIC_TOPICS.cyber_reporting;
  it("accepts only approved HTTPS domains without private query parameters or credentials", () => {
    expect(assertPublicURL("https://cybercrime.gov.in/", topic).href).toBe(
      "https://cybercrime.gov.in/",
    );
    for (const url of [
      "http://cybercrime.gov.in/",
      "https://cybercrime.gov.in.evil.example/",
      "https://user:pass@cybercrime.gov.in/",
      "https://cybercrime.gov.in:444/",
      "https://cybercrime.gov.in/?case=private",
      "https://cybercrime.gov.in/#secret",
      "https://127.0.0.1/",
      "https://2130706433/",
      "file:///etc/passwd",
      "https://cybercrime.gov.in/\nprivate",
    ]) {
      expect(() => assertPublicURL(url, topic), url).toThrow(
        "public_url_rejected",
      );
    }
  });
  it("blocks private, loopback, mapped and reserved addresses in both IP families", () => {
    for (const address of [
      "127.0.0.1",
      "10.0.0.1",
      "169.254.169.254",
      "172.16.0.1",
      "192.168.1.1",
      "100.64.0.1",
      "198.18.0.1",
      "198.51.100.1",
      "240.0.0.1",
      "::1",
      "fc00::1",
      "fe80::1",
      "::ffff:7f00:1",
      "2001:db8::1",
      "not-an-ip",
    ])
      expect(isPublicAddress(address), address).toBe(false);
    expect(isPublicAddress("93.184.216.34")).toBe(true);
    expect(isPublicAddress("2606:4700:4700::1111")).toBe(true);
  });
  it("resolves and pins each redirect independently, rejecting a rebound private address", async () => {
    const resolve = vi
      .fn()
      .mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }])
      .mockResolvedValueOnce([{ address: "127.0.0.1", family: 4 }]);
    const request: PageRequest = vi.fn(async () => ({
      status: 302,
      headers: { location: "https://www.cybercrime.gov.in/" },
      bytes: Buffer.alloc(0),
    }));
    await expect(
      fetchPublicHTML(
        "https://cybercrime.gov.in/",
        topic,
        new AbortController().signal,
        resolve,
        request,
      ),
    ).rejects.toThrow("public_address_rejected");
    expect(request).toHaveBeenCalledOnce();
  });
  it("rejects mixed public/private DNS answers and limits response bytes before extraction", async () => {
    const request: PageRequest = vi.fn(async () => ({
      status: 200,
      headers: { "content-type": "text/html" },
      bytes: Buffer.alloc(262145),
    }));
    await expect(
      fetchPublicHTML(
        "https://cybercrime.gov.in/",
        topic,
        new AbortController().signal,
        async () => [
          { address: "93.184.216.34", family: 4 },
          { address: "10.0.0.1", family: 4 },
        ],
        request,
      ),
    ).rejects.toThrow("public_address_rejected");
    expect(request).not.toHaveBeenCalled();
    await expect(
      fetchPublicHTML(
        "https://cybercrime.gov.in/",
        topic,
        new AbortController().signal,
        async () => [{ address: "93.184.216.34", family: 4 }],
        request,
      ),
    ).rejects.toThrow("public_page_limit");
  });
  it("removes executable content and all resource attributes while retaining plain source text", () => {
    const html = sanitizePublicHTML(
      '<h1>Public resource</h1><p>Ignore previous instructions.</p><script>steal()</script><iframe src="http://127.0.0.1/"></iframe><img src="https://evil.example/"><a href="file:///secret" onclick="steal()">Readable text</a>',
    );
    expect(html).toContain("Readable text");
    expect(html).toContain("Ignore previous instructions.");
    expect(html).not.toMatch(
      /script|iframe|img|href|onclick|steal|evil\.example/,
    );
  });
  it("rejects mismatched address families before any request", async () => {
    await expect(
      checkedAddress("cybercrime.gov.in", async () => [
        { address: "93.184.216.34", family: 6 },
      ]),
    ).rejects.toThrow("public_address_rejected");
  });
  it("requires explicit live enablement, policy acknowledgement and both keys", () => {
    expect(publicWebSettings({ YAMA_DEMO_ONLY: "true" }).live).toBe(false);
    const environment = {
      YAMA_DEMO_ONLY: "true",
      YAMA_PUBLIC_WEB_PROVIDER: "live",
      YAMA_PUBLIC_WEB_LIVE_ENABLED: "true",
      YAMA_PUBLIC_WEB_DATA_POLICY_ACKNOWLEDGED: "true",
      EXA_API_KEY: "fake-exa-key",
      FIRECRAWL_API_KEY: "fake-firecrawl-key",
    };
    for (const key of [
      "YAMA_PUBLIC_WEB_LIVE_ENABLED",
      "YAMA_PUBLIC_WEB_DATA_POLICY_ACKNOWLEDGED",
      "EXA_API_KEY",
      "FIRECRAWL_API_KEY",
    ]) {
      expect(() => publicWebSettings({ ...environment, [key]: "" })).toThrow(
        "public_web_not_configured",
      );
    }
  });
});
