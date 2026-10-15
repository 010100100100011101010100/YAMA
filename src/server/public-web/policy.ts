import "server-only";
import { BlockList, isIP } from "node:net";
import { ServiceError } from "@/server/errors";

export const PUBLIC_WEB_POLICY = "official-public-html-v1";
export const PUBLIC_TOPICS = {
  cyber_reporting: {
    domains: ["cybercrime.gov.in", "www.cybercrime.gov.in"],
    query: "India national cybercrime reporting official portal",
  },
  consumer_reporting: {
    domains: ["consumerhelpline.gov.in", "www.consumerhelpline.gov.in"],
    query: "India National Consumer Helpline official grievance information",
  },
  cyber_safety: {
    domains: [
      "cert-in.org.in",
      "www.cert-in.org.in",
      "cybercrime.gov.in",
      "www.cybercrime.gov.in",
    ],
    query: "India official CERT-In cyber safety public awareness",
  },
} as const;
export type PublicTopic = keyof typeof PUBLIC_TOPICS;
export type TopicPolicy = { readonly domains: readonly string[] };

export function assertPublicURL(value: string, topic: TopicPolicy) {
  if (
    typeof value !== "string" ||
    value.length > 1000 ||
    Array.from(value).some(
      (character) =>
        character.charCodeAt(0) <= 32 ||
        character.charCodeAt(0) === 127 ||
        character === "\\",
    )
  )
    throw new ServiceError(422, "public_url_rejected");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ServiceError(422, "public_url_rejected");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    url.search ||
    url.hash ||
    !topic.domains.includes(url.hostname) ||
    /%(?:0[0-9a-f]|1[0-9a-f]|7f|2f|3f|5c)/i.test(url.pathname)
  )
    throw new ServiceError(422, "public_url_rejected");
  return url;
}

const blocked = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const)
  blocked.addSubnet(address, prefix, "ipv4");
for (const [address, prefix] of [
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["3fff::", 20],
] as const)
  blocked.addSubnet(address, prefix, "ipv6");
const globalV6 = new BlockList();
globalV6.addSubnet("2000::", 3, "ipv6");
export function isPublicAddress(address: string) {
  try {
    const family = isIP(address);
    return family === 4
      ? !blocked.check(address, "ipv4")
      : family === 6 &&
          globalV6.check(address, "ipv6") &&
          !blocked.check(address, "ipv6");
  } catch {
    return false;
  }
}
