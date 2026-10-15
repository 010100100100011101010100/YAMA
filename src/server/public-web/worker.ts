import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { publicWebResult, type PublicWebResult } from "@/lib/public-web";
import { assistanceCatalogue } from "@/server/assistance/catalogue";
import { ServiceError } from "@/server/errors";
import { PUBLIC_TOPICS, assertPublicURL } from "./policy";
import {
  checkedAddress,
  resolvePublic,
  fetchPublicHTML,
  type PublicResolver,
} from "./network";
import {
  publicWebConfigHash,
  SEARCH_RESERVATION_MICRO_USD,
  PAGE_RESERVATION_CREDITS,
} from "./config";
import { runPublicProvider, type PublicProviderRunner } from "./runtime";
import { PublicWebService } from "./service";
import type { PublicWebBudget } from "./records";

const searchResponse = z.object({
  results: z
    .array(
      z.object({
        url: z.string().max(1000),
        title: z.string().max(1000).nullable().optional(),
        publishedDate: z.string().max(50).nullable().optional(),
      }),
    )
    .max(3),
  costDollars: z
    .object({ total: z.number().finite().nonnegative() })
    .nullable()
    .optional(),
});
const pageResponse = z.object({
  markdown: z.string().min(1).max(262144),
  metadata: z
    .object({
      numPages: z.number().int().min(1).max(1).optional(),
      creditsUsed: z.number().finite().nonnegative().nullable().optional(),
    })
    .optional(),
});
type Execution = {
  run?: PublicProviderRunner;
  resolve?: PublicResolver;
  fetchPage?: typeof fetchPublicHTML;
};
const hash = (text: string | Buffer) =>
  createHash("sha256").update(text).digest("hex");
export class PublicWebWorker {
  constructor(
    readonly service: PublicWebService,
    private readonly execution: Execution = {},
  ) {}
  async runOnce(signal: AbortSignal = new AbortController().signal) {
    if (signal.aborted) return false;
    const token = randomUUID(),
      claimed = await this.service.claim(token);
    if (!claimed) return false;
    if (claimed.orphan) {
      await this.service.release(token);
      return true;
    }
    const record = claimed.record,
      canceled = new AbortController(),
      deadline = AbortSignal.any([
        signal,
        canceled.signal,
        AbortSignal.timeout(25000),
      ]);
    let checking = false;
    const monitor = setInterval(() => {
      if (checking || deadline.aborted) return;
      checking = true;
      this.service
        .current(record, token)
        .then(() => {
          if (
            publicWebConfigHash(this.service.settings()) !== record.configHash
          )
            canceled.abort();
        })
        .catch(() => canceled.abort())
        .finally(() => {
          checking = false;
        });
    }, 500);
    try {
      const settings = this.service.settings();
      if (publicWebConfigHash(settings) !== record.configHash)
        throw new ServiceError(503, "public_web_config_changed");
      const runner = this.execution.run ?? runPublicProvider;
      if (
        settings.live &&
        process.env.NODE_ENV === "test" &&
        runner === runPublicProvider
      )
        throw new ServiceError(503, "live_provider_disabled_in_tests");
      await this.service.current(record, token);
      await this.service.reserve(record, token, settings);
      deadline.throwIfAborted();
      const topic = PUBLIC_TOPICS[record.topic];
      let output: PublicWebResult;
      if (record.operation === "search_public_web") {
        const raw = settings.live
          ? await runner(
              record.operation,
              { query: topic.query, domains: topic.domains },
              settings,
              deadline,
            )
          : {
              results: [
                {
                  url: `https://${topic.domains[0]}/`,
                  title: "Authored public-source fixture",
                  publishedDate: null,
                },
              ],
              costDollars: null,
            };
        const parsed = searchResponse.safeParse(raw);
        if (!parsed.success)
          throw new ServiceError(503, "public_provider_invalid");
        if (
          parsed.data.costDollars &&
          Math.ceil(parsed.data.costDollars.total * 1000000) >
            SEARCH_RESERVATION_MICRO_USD
        ) {
          await this.blockBudget();
          throw new ServiceError(422, "public_provider_cost_changed");
        }
        const sources: Extract<PublicWebResult, { kind: "search" }>["sources"] =
          [];
        let omittedCount = 0;
        for (const candidate of parsed.data.results) {
          deadline.throwIfAborted();
          try {
            const url = assertPublicURL(candidate.url, topic);
            if (sources.some((source) => source.url === url.href)) continue;
            if (settings.live)
              await checkedAddress(
                url.hostname,
                this.execution.resolve ?? resolvePublic,
              );
            sources.push({
              id: randomUUID(),
              url: url.href,
              title:
                (candidate.title ?? url.hostname)
                  .split("")
                  .map((character) =>
                    character.charCodeAt(0) < 32 ||
                    character.charCodeAt(0) === 127
                      ? " "
                      : character,
                  )
                  .join("")
                  .trim()
                  .slice(0, 200) || url.hostname,
              publisher: url.hostname,
              publishedAt: candidate.publishedDate ?? null,
              retrievedAt: new Date().toISOString(),
              trust: settings.live
                ? ("unverified_index" as const)
                : ("authored_fixture" as const),
              contentIsUntrusted: true as const,
            });
          } catch {
            omittedCount++;
          }
        }
        output = {
          kind: "search",
          query: topic.query,
          localGuidance: assistanceCatalogue(record.language),
          sources,
          omittedCount,
        };
      } else {
        if (record.command.operation !== "fetch_public_page")
          throw new ServiceError(503, "public_provider_invalid");
        const command = record.command;
        const parent = await this.service.jobs.findOne({
          _id: command.searchId,
          ownerId: record.ownerId,
          reportId: record.reportId,
          revision: record.revision,
          status: "ready",
          expiresAt: { $gt: new Date() },
        });
        const source =
          parent?.result?.kind === "search"
            ? parent.result.sources.find((item) => item.id === command.sourceId)
            : undefined;
        if (!source) throw new ServiceError(404, "public_source_not_found");
        assertPublicURL(source.url, topic);
        const html = settings.live
          ? await (this.execution.fetchPage ?? fetchPublicHTML)(
              source.url,
              topic,
              deadline,
              this.execution.resolve ?? resolvePublic,
            )
          : {
              url: source.url,
              html: "<p>Authored public-source fixture. This is not current official guidance.</p>",
              htmlSha256: hash("authored-public-html-v1"),
              retrievedAt: new Date().toISOString(),
              redirects: [],
            };
        await this.service.current(record, token);
        deadline.throwIfAborted();
        const raw = settings.live
          ? await runner(
              record.operation,
              { html: html.html },
              settings,
              deadline,
            )
          : {
              markdown:
                "Authored public-source fixture. This is not current official guidance.",
              metadata: { numPages: 1, creditsUsed: 0 },
            };
        const parsed = pageResponse.safeParse(raw);
        if (!parsed.success)
          throw new ServiceError(503, "public_provider_invalid");
        if (
          (parsed.data.metadata?.creditsUsed ?? 0) > PAGE_RESERVATION_CREDITS
        ) {
          await this.blockBudget();
          throw new ServiceError(422, "public_provider_cost_changed");
        }
        let text = parsed.data.markdown.slice(0, 8000);
        if (/[\uD800-\uDBFF]$/.test(text)) text = text.slice(0, -1);
        output = {
          kind: "page",
          source: {
            ...source,
            url: html.url,
            publisher: new URL(html.url).hostname,
            retrievedAt: html.retrievedAt,
          },
          discoveredUrl: source.url,
          text,
          truncated: text.length < parsed.data.markdown.length,
          htmlSha256: html.htmlSha256,
          textSha256: hash(text),
          redirects: html.redirects,
          verification: settings.live
            ? "unverified_public_source"
            : "authored_fixture",
          contentIsUntrusted: true,
        };
      }
      deadline.throwIfAborted();
      await this.service.publish(record, token, publicWebResult.parse(output));
    } catch (error) {
      const code =
        error instanceof ServiceError
          ? error.code
          : deadline.aborted
            ? "public_web_interrupted"
            : "public_provider_failed";
      await this.service.fail(record, token, code);
    } finally {
      clearInterval(monitor);
      await this.service.release(token);
    }
    return true;
  }
  private async blockBudget() {
    await this.service.database
      .collection<PublicWebBudget>("public_web_budgets")
      .updateOne({ _id: "public-web-demo" }, { $set: { blocked: true } });
  }
}
