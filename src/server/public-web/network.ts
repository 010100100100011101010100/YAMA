import "server-only";
import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { createHash } from "node:crypto";
import { isIP } from "node:net";
import sanitizeHtml from "sanitize-html";
import { ServiceError } from "@/server/errors";
import { assertPublicURL, isPublicAddress, type TopicPolicy } from "./policy";

const MAX_PAGE_BYTES = 262144;
export type Address = { address: string; family: number };
export type PublicResolver = (hostname: string) => Promise<Address[]>;
export type PageReply = {
  status: number;
  headers: Record<string, string | undefined>;
  bytes: Buffer;
};
export type PageRequest = (
  url: URL,
  address: Address,
  signal: AbortSignal,
) => Promise<PageReply>;
export const resolvePublic: PublicResolver = (hostname) =>
  lookup(hostname, { all: true, verbatim: true });
export async function checkedAddress(
  hostname: string,
  resolve: PublicResolver = resolvePublic,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new ServiceError(503, "public_dns_timeout")),
      3000,
    );
  });
  let addresses: Address[];
  try {
    addresses = await Promise.race([resolve(hostname), timeout]);
  } finally {
    clearTimeout(timer);
  }
  if (
    !addresses.length ||
    addresses.some(
      (address) =>
        ![4, 6].includes(address.family) ||
        isIP(address.address) !== address.family ||
        !isPublicAddress(address.address),
    )
  )
    throw new ServiceError(422, "public_address_rejected");
  return addresses.find((address) => address.family === 4) ?? addresses[0];
}
export const requestPinnedPage: PageRequest = (url, address, signal) =>
  new Promise((resolve, reject) => {
    // No proxy, cookies, ambient credentials, browser execution or automatic redirects.
    const request = httpsRequest(
      url,
      {
        method: "GET",
        agent: false,
        servername: url.hostname,
        rejectUnauthorized: true,
        family: address.family,
        lookup: (_hostname, _options, done) =>
          done(null, address.address, address.family),
        maxHeaderSize: 8192,
        headers: {
          Accept: "text/html",
          "Accept-Encoding": "identity",
          "User-Agent": "YamaPublicSource/1.0",
        },
        signal,
      },
      (response) => {
        const status = response.statusCode ?? 0;
        const headers = {
          location: response.headers.location,
          "content-type": response.headers["content-type"],
          "content-encoding": response.headers["content-encoding"],
        };
        if (status !== 200) {
          response.destroy();
          resolve({ status, headers, bytes: Buffer.alloc(0) });
          return;
        }
        if (
          headers["content-type"]?.split(";")[0].trim().toLowerCase() !==
            "text/html" ||
          (headers["content-encoding"] &&
            headers["content-encoding"] !== "identity")
        ) {
          response.destroy();
          reject(new ServiceError(415, "public_html_required"));
          return;
        }
        if (Number(response.headers["content-length"]) > MAX_PAGE_BYTES) {
          response.destroy();
          reject(new ServiceError(413, "public_page_limit"));
          return;
        }
        const chunks: Buffer[] = [];
        let bytes = 0;
        response.on("data", (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > MAX_PAGE_BYTES)
            request.destroy(new ServiceError(413, "public_page_limit"));
          else chunks.push(chunk);
        });
        response.once("end", () =>
          resolve({ status, headers, bytes: Buffer.concat(chunks) }),
        );
        response.once("error", () =>
          reject(new ServiceError(503, "public_page_unavailable")),
        );
      },
    );
    request.setTimeout(5000, () =>
      request.destroy(new ServiceError(503, "public_page_timeout")),
    );
    request.once("error", (error) =>
      reject(
        error instanceof ServiceError
          ? error
          : new ServiceError(503, "public_page_unavailable"),
      ),
    );
    request.end();
  });
export function sanitizePublicHTML(html: string) {
  const clean = sanitizeHtml(html, {
    allowedTags: [
      "html",
      "body",
      "main",
      "article",
      "section",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "p",
      "ul",
      "ol",
      "li",
      "table",
      "thead",
      "tbody",
      "tr",
      "th",
      "td",
      "blockquote",
      "strong",
      "em",
      "code",
      "pre",
      "br",
      "a",
    ],
    allowedAttributes: {},
    allowProtocolRelative: false,
    nonTextTags: [
      "script",
      "style",
      "textarea",
      "noscript",
      "iframe",
      "object",
      "embed",
      "svg",
      "math",
      "form",
    ],
  });
  if (!clean.trim() || Buffer.byteLength(clean) > 131072)
    throw new ServiceError(413, "public_page_limit");
  return clean;
}
export async function fetchPublicHTML(
  value: string,
  topic: TopicPolicy,
  signal: AbortSignal,
  resolve: PublicResolver = resolvePublic,
  request: PageRequest = requestPinnedPage,
) {
  let url = assertPublicURL(value, topic);
  const redirects: string[] = [];
  for (let hop = 0; hop <= 3; hop++) {
    signal.throwIfAborted();
    const address = await checkedAddress(url.hostname, resolve);
    signal.throwIfAborted();
    const reply = await request(url, address, signal);
    signal.throwIfAborted();
    if ([301, 302, 303, 307, 308].includes(reply.status)) {
      if (hop === 3 || !reply.headers.location)
        throw new ServiceError(422, "public_redirect_rejected");
      redirects.push(url.href);
      url = assertPublicURL(new URL(reply.headers.location, url).href, topic);
      continue;
    }
    if (reply.status !== 200)
      throw new ServiceError(503, "public_page_unavailable");
    if (reply.bytes.length > MAX_PAGE_BYTES)
      throw new ServiceError(413, "public_page_limit");
    if (
      reply.headers["content-type"]?.split(";")[0].trim().toLowerCase() !==
        "text/html" ||
      (reply.headers["content-encoding"] &&
        reply.headers["content-encoding"] !== "identity")
    )
      throw new ServiceError(415, "public_html_required");
    let html: string;
    try {
      html = new TextDecoder("utf-8", { fatal: true }).decode(reply.bytes);
    } catch {
      throw new ServiceError(415, "public_utf8_required");
    }
    return {
      url: url.href,
      html: sanitizePublicHTML(html),
      htmlSha256: createHash("sha256").update(reply.bytes).digest("hex"),
      retrievedAt: new Date().toISOString(),
      redirects,
    };
  }
  throw new ServiceError(422, "public_redirect_rejected");
}
