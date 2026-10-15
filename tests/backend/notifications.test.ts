import { describe, expect, it } from "vitest";
import { notificationSettings } from "@/server/notifications/config";
import { buildNotificationContent } from "@/server/notifications/domain";

describe("bounded notification templates and configuration", () => {
  it("defaults to capture-only fixtures and requires explicit live controls", () => {
    expect(notificationSettings({ YAMA_DEMO_ONLY: "true" }).live).toBe(false);
    for (const environment of [
      { YAMA_DEMO_ONLY: "false" },
      { YAMA_DEMO_ONLY: "true", YAMA_MAIL_PROVIDER: "resend" },
    ])
      expect(() => notificationSettings(environment)).toThrow(
        "mail_not_configured",
      );
  });
  it("uses fixed generic copy in English, Hindi and Hinglish, without report data or bearer links", () => {
    for (const language of ["en", "hi", "hinglish"] as const) {
      const content = buildNotificationContent(
        language,
        "http://127.0.0.1:3000",
      );
      expect(content.subject.length).toBeGreaterThan(8);
      expect(content.text).toContain("http://127.0.0.1:3000/");
      expect(content.html).toContain(
        `lang="${language === "hi" ? "hi" : "en"}"`,
      );
      expect(content.text).not.toMatch(
        /reportId|token=|incident_id|private-account|₹/,
      );
    }
  });
  it("rejects arbitrary origins and header injection instead of interpolating them", () => {
    for (const origin of [
      "https://evil.example/",
      "http://127.0.0.1:3000/?token=secret",
      "http://user:pass@127.0.0.1:3000",
      "http://127.0.0.1:3000\r\nBcc:evil@example.invalid",
    ]) {
      expect(() => buildNotificationContent("en", origin)).toThrow(
        "mail_origin_rejected",
      );
    }
  });
});
