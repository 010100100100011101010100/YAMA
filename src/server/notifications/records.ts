import type { NotificationView } from "@/lib/notification";
export type RecipientRecord = {
  _id: string;
  ownerId: string;
  mode: "fixture" | "live";
  address: string;
  verification: "fixture" | "operator_confirmed_synthetic";
  active: boolean;
  verifiedAt: Date;
  approvalFence: number;
};
export type NotificationRecord = Omit<
  NotificationView,
  | "id"
  | "expiresAt"
  | "approvedAt"
  | "cancellationRequested"
  | "deliveryConfirmed"
> & {
  _id: string;
  ownerId: string;
  logicalHash: string;
  configHash: string;
  requestKey: string | null;
  requestHash: string | null;
  createdAt: Date;
  expiresAt: Date;
  approvedAt: Date | null;
  allowFallback: boolean;
  cancelRequestedAt: Date | null;
  claimToken: string | null;
  leaseUntil: Date | null;
  outcomes: {
    provider: NotificationView["provider"];
    outcome: string;
    at: Date;
    code: string | null;
    providerRef: string | null;
  }[];
};
export type NotificationBudget = {
  _id: "mail-synthetic-demo";
  reservedAttempts: number;
};
