import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MongoClient, type Db } from "mongodb";
import { randomUUID } from "node:crypto";
import { initializeSchema } from "@/server/database/schema";
import { VoiceService } from "@/server/voice/service";
import { voiceSettings } from "@/server/voice/config";
import { DialogueService } from "@/server/dialogue/service";
import type { VoiceRecord } from "@/server/voice/records";
import type { DialogueRecord } from "@/server/dialogue/service";
import { ReportRepository } from "@/server/reports/repository";
process.loadEnvFile(".env.local");
const namespace = `yama_voice_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
let mongo: MongoClient, db: Db, voice: VoiceService, dialogue: DialogueService;
const settings = voiceSettings({
  YAMA_DEMO_ONLY: "true",
  YAMA_VOICE_LIVE_ENABLED: "true",
  YAMA_SARVAM_DATA_POLICY_ACKNOWLEDGED: "true",
  SARVAM_API_KEY: "test-only-key",
  LIVEKIT_URL: "ws://127.0.0.1:7880",
  LIVEKIT_API_KEY: "test-voice",
  LIVEKIT_API_SECRET: "a".repeat(64),
  YAMA_VOICE_MAX_SECONDS: "600",
});
function wave() {
  const pcm = Buffer.alloc(3200);
  const header = Buffer.alloc(44);
  header.write("RIFF");
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(16000, 24);
  header.writeUInt32LE(32000, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}
async function open() {
  return voice.start("owner-a", {
    reportId: null,
    expectedRevision: null,
    key: randomUUID(),
    language: "hi",
    consented: true,
  });
}
async function proposed(
  reportId: string,
  id: string,
  text = "काल्पनिक: ₹8000 दिए।",
) {
  const utteranceId = randomUUID();
  await db
    .collection<VoiceRecord>("voice_sessions")
    .updateOne(
      { _id: reportId, id },
      {
        $push: { transcripts: { id: utteranceId, text, status: "proposed" } },
        $set: { status: "listening" },
      },
    );
  return utteranceId;
}
beforeAll(async () => {
  mongo = new MongoClient(
    "mongodb://127.0.0.1:27018/?replicaSet=yama-rs&directConnection=true",
    {
      auth: {
        username: "yama_root",
        password: process.env.MONGO_ROOT_PASSWORD!,
      },
      authSource: "admin",
    },
  );
  await mongo.connect();
  db = mongo.db(namespace);
  await initializeSchema(db);
  voice = new VoiceService(
    db,
    mongo,
    () => settings,
    async () => wave(),
  );
  dialogue = new DialogueService(db, mongo);
});
afterAll(async () => {
  if (mongo) {
    await mongo.db(namespace).dropDatabase();
    await mongo.close();
  }
});
beforeEach(async () => {
  await db.collection("voice_budgets").deleteMany({});
  await db.collection("voice_sessions").deleteMany({});
  await db.collection("voice_playouts").deleteMany({});
});
async function ready() {
  const started = await open(),
    utteranceId = await proposed(
      started.report._id,
      started.session.id,
      "Fictional voice",
    );
  await voice.accept("owner-a", started.report._id, {
    sessionId: started.session.id,
    utteranceId,
    expectedRevision: 1,
    text: "Fictional voice",
    acknowledged: true,
  });
  await db
    .collection<DialogueRecord>("dialogues")
    .updateOne(
      { _id: started.report._id },
      {
        $set: {
          "turn.status": "ready",
          "turn.reply": {
            text: "Fictional reply.",
            handoff: { target: "disha", reason: "next_actions" },
          },
        },
      },
    );
  const current = await dialogue.get("owner-a", started.report._id);
  return { ...started, turnId: current.turn!.id };
}
describe("owned voice lifecycle", () => {
  it("creates an empty voice-first draft without inventing narration and replays starts once", async () => {
    const input = {
      reportId: null,
      expectedRevision: null,
      key: randomUUID(),
      language: "hi",
      consented: true,
    };
    const first = await voice.start("owner-a", input),
      second = await voice.start("owner-a", input);
    expect(first.report.messages).toEqual([]);
    expect(first.report.assertions).toEqual([]);
    expect(second.session.id).toBe(first.session.id);
    await voice.control("owner-a", first.report._id, {
      sessionId: first.session.id,
      operation: "stop",
    });
  });
  it("requires explicit transcript review, preserves raw and corrected wording, and queues dialogue once", async () => {
    const started = await open(),
      utteranceId = await proposed(started.report._id, started.session.id);
    expect(
      (await new ReportRepository(db, mongo).get("owner-a", started.report._id))
        .messages,
    ).toEqual([]);
    const input = {
      sessionId: started.session.id,
      utteranceId,
      expectedRevision: 1,
      text: "काल्पनिक: ₹7000 दिए।",
      acknowledged: true,
    };
    const [first, second] = await Promise.all([
      voice.accept("owner-a", started.report._id, input),
      voice.accept("owner-a", started.report._id, input),
    ]);
    expect(first.report.revision).toBe(2);
    expect(second.report.revision).toBe(2);
    expect(first.report.confirmation).toBeNull();
    expect(first.report.messages[0].voiceSource).toMatchObject({
      rawTranscript: "काल्पनिक: ₹8000 दिए।",
      model: "saaras:v4",
    });
    expect(
      (await dialogue.get("owner-a", started.report._id)).turn?.status,
    ).toBe("queued");
    await voice.control("owner-a", started.report._id, {
      sessionId: started.session.id,
      operation: "stop",
    });
  });
  it.each([
    ["काल्पनिक: @Disha, आगे क्या करूँ?", "disha"],
    ["काल्पनिक: दिशा, आगे क्या करूँ?", "saathi"],
  ])("routes the reviewed voice text with the same addressing rules: %s", async (text, agent) => {
    const started = await open();
    const utteranceId = await proposed(started.report._id, started.session.id, text);
    await voice.accept("owner-a", started.report._id, { sessionId: started.session.id, utteranceId, expectedRevision: 1, text, acknowledged: true });
    const current = await dialogue.get("owner-a", started.report._id);
    expect(current.turn?.agent).toBe(agent);
    expect(current.turn?.status).toBe("queued");
    expect(current.messages).toEqual([]);
    await voice.control("owner-a", started.report._id, { sessionId: started.session.id, operation: "stop" });
  });
  it("denies another account, old revisions and forged review", async () => {
    const started = await open(),
      utteranceId = await proposed(started.report._id, started.session.id);
    await expect(
      voice.get("owner-b", started.report._id, started.session.id),
    ).rejects.toThrow("report_not_found");
    const input = {
      sessionId: started.session.id,
      utteranceId,
      expectedRevision: 1,
      text: "Fictional",
      acknowledged: true,
    };
    await expect(
      voice.accept("owner-b", started.report._id, input),
    ).rejects.toThrow("report_not_found");
    await expect(
      voice.accept("owner-a", started.report._id, {
        ...input,
        acknowledged: false,
      }),
    ).rejects.toThrow("invalid_request");
    await expect(
      voice.accept("owner-a", started.report._id, {
        ...input,
        expectedRevision: 2,
      }),
    ).rejects.toThrow("revision_conflict");
    await voice.control("owner-a", started.report._id, {
      sessionId: started.session.id,
      operation: "stop",
    });
  });
  it("holds handoffs until completed audio and rejects text-only delivery in a voice session", async () => {
    const started = await open(),
      utteranceId = await proposed(
        started.report._id,
        started.session.id,
        "Fictional voice",
      );
    await voice.accept("owner-a", started.report._id, {
      sessionId: started.session.id,
      utteranceId,
      expectedRevision: 1,
      text: "Fictional voice",
      acknowledged: true,
    });
    await db
      .collection<DialogueRecord>("dialogues")
      .updateOne(
        { _id: started.report._id },
        {
          $set: {
            "turn.status": "ready",
            "turn.reply": {
              text: "Fictional reply.",
              handoff: { target: "disha", reason: "next_actions" },
            },
          },
        },
      );
    const current = await dialogue.get("owner-a", started.report._id),
      turnId = current.turn!.id;
    await expect(
      dialogue.change("owner-a", started.report._id, {
        operation: "delivered",
        expectedRevision: 2,
        expectedVersion: current.version,
        turnId,
      }),
    ).rejects.toThrow("voice_playout_required");
    const clip = await voice.synthesize("owner-a", started.report._id, {
      sessionId: started.session.id,
      turnId,
      expectedRevision: 2,
    });
    const receipt = {
      sessionId: started.session.id,
      clipId: clip.id,
      nonce: clip.nonce,
      operation: "ended",
    };
    await expect(
      voice.playback("owner-a", started.report._id, receipt),
    ).rejects.toThrow("voice_not_played");
    await voice.playback("owner-a", started.report._id, {
      ...receipt,
      operation: "started",
    });
    await new Promise((resolve) => setTimeout(resolve, 120));
    await voice.playback("owner-a", started.report._id, receipt);
    await voice.playback("owner-a", started.report._id, receipt);
    const delivered = await dialogue.get("owner-a", started.report._id);
    expect(delivered.activeAgent).toBe("disha");
    expect(delivered.messages).toHaveLength(1);
    await voice.control("owner-a", started.report._id, {
      sessionId: started.session.id,
      operation: "stop",
    });
  });
  it("keeps unreviewed speech after disconnection and blocks a replacement until it is reviewed", async () => {
    const started = await open(),
      utteranceId = await proposed(started.report._id, started.session.id);
    await voice.control("owner-a", started.report._id, {
      sessionId: started.session.id,
      operation: "text",
    });
    await expect(
      voice.start("owner-a", {
        reportId: started.report._id,
        expectedRevision: 1,
        key: randomUUID(),
        language: "hi",
        consented: true,
      }),
    ).rejects.toThrow("voice_review_pending");
    const accepted = await voice.accept("owner-a", started.report._id, {
      sessionId: started.session.id,
      utteranceId,
      expectedRevision: 1,
      text: "Fictional corrected words.",
      acknowledged: true,
    });
    expect(accepted.report.messages[0].voiceSource?.rawTranscript).toBe(
      "काल्पनिक: ₹8000 दिए।",
    );
    expect(
      (await dialogue.get("owner-a", started.report._id)).voiceSessionId,
    ).toBeUndefined();
    expect(accepted.report.confirmation).toBeNull();
  });
  it("revokes a late synthesized clip after interruption without advancing an agent", async () => {
    const started = await ready();
    let finish!: (audio: Buffer) => void;
    let entered!: () => void;
    const producing = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const slow = new VoiceService(
      db,
      mongo,
      () => settings,
      async () => {
        entered();
        return new Promise<Buffer>((resolve) => {
          finish = resolve;
        });
      },
    );
    const prepared = slow.synthesize("owner-a", started.report._id, {
      sessionId: started.session.id,
      turnId: started.turnId,
      expectedRevision: 2,
    });
    await producing;
    await voice.control("owner-a", started.report._id, {
      sessionId: started.session.id,
      operation: "interrupt",
    });
    finish(wave());
    await expect(prepared).rejects.toThrow("speech_failed");
    const current = await dialogue.get("owner-a", started.report._id);
    expect(current.messages).toEqual([]);
    expect(current.turn?.status).toBe("canceled");
    expect(
      (
        await db
          .collection("voice_playouts")
          .findOne({ reportId: started.report._id })
      )?.audio,
    ).toBeNull();
    await voice.control("owner-a", started.report._id, {
      sessionId: started.session.id,
      operation: "stop",
    });
  });
  it("returns the same clip without another synthesis and prevents cross-account audio access", async () => {
    const started = await ready(),
      input = {
        sessionId: started.session.id,
        turnId: started.turnId,
        expectedRevision: 2,
      };
    const first = await voice.synthesize("owner-a", started.report._id, input),
      second = await voice.synthesize("owner-a", started.report._id, input);
    expect(second).toEqual(first);
    expect(
      (
        await db
          .collection("voice_budgets")
          .findOne({ _id: "sarvam-demo" } as never)
      )?.reservedCalls,
    ).toBe(1);
    await expect(
      voice.audio("owner-b", started.report._id, first.id),
    ).rejects.toThrow("report_not_found");
    await voice.control("owner-a", started.report._id, {
      sessionId: started.session.id,
      operation: "text",
    });
    await expect(
      voice.audio("owner-a", started.report._id, first.id),
    ).rejects.toThrow();
    const current = await dialogue.get("owner-a", started.report._id);
    expect(current.turn?.status).toBe("ready");
    expect(current.messages).toEqual([]);
    await dialogue.change("owner-a", started.report._id, {
      operation: "delivered",
      expectedRevision: 2,
      expectedVersion: current.version,
      turnId: started.turnId,
    });
    expect(
      (await dialogue.get("owner-a", started.report._id)).messages,
    ).toHaveLength(1);
  });
  it("reserves the duration budget once and never refunds uncertain sessions", async () => {
    const limited = new VoiceService(db, mongo, () => ({
      ...settings,
      maxSeconds: 120,
    }));
    const input = {
      reportId: null,
      expectedRevision: null,
      key: randomUUID(),
      language: "en",
      consented: true,
    };
    const started = await limited.start("owner-a", input);
    await limited.start("owner-a", input);
    expect(
      (
        await db
          .collection("voice_budgets")
          .findOne({ _id: "sarvam-demo" } as never)
      )?.reservedSeconds,
    ).toBe(120);
    await limited.control("owner-a", started.report._id, {
      sessionId: started.session.id,
      operation: "stop",
    });
    await expect(
      limited.start("owner-a", { ...input, key: randomUUID() }),
    ).rejects.toThrow("voice_budget_exhausted");
  });
});
