import type { PublicWebView, PublicWebCommand } from "@/lib/public-web";
export type PublicWebRecord = Omit<
  PublicWebView,
  "id" | "expiresAt" | "localGuidance"
> & {
  _id: string;
  ownerId: string;
  requestKey: string;
  requestHash: string;
  configHash: string;
  policy: string;
  language: "en" | "hi" | "hinglish";
  command: PublicWebCommand;
  createdAt: Date;
  cacheCreatedAt: Date;
  expiresAt: Date;
  attempts: number;
  claimToken: string | null;
  leaseUntil: Date | null;
};
export type PublicWebBudget = {
  _id: "public-web-demo";
  reservedSearches: number;
  reservedPages: number;
  reservedExaMicroUsd: number;
  reservedFirecrawlCredits: number;
  blocked: boolean;
};
