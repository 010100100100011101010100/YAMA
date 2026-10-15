import type { Binary } from "mongodb";
import type { VoiceView, VoiceClip } from "@/lib/voice";
export type VoiceRecord = Omit<VoiceView, "expiresAt" | "reportId"> & {
  _id: string;
  ownerId: string;
  expiresAt: Date;
  requestKey: string;
  requestHash: string;
  configHash: string;
  room: string;
  clientIdentity: string;
  workerIdentity: string;
  claimToken: string | null;
  fence?: number;
};
export type PlayoutRecord = VoiceClip & {
  _id: string;
  ownerId: string;
  dialogueVersion: number;
  status: "preparing" | "ready" | "failed" | "canceled" | "played";
  audio: Binary | null;
  startedAt: Date | null;
  expiresAt: Date;
  errorCode: string | null;
};
export type VoiceBudget = {
  _id: string;
  reservedSeconds: number;
  reservedCalls: number;
};
