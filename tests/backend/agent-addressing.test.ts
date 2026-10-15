import { describe, expect, it } from "vitest";
import { resolveAgentAddress } from "@/lib/agent-addressing";

describe("saved-message agent addressing", () => {
  it.each([
    ["@Drishti, compare these cases.", "drishti"],
    ["Please help, @DISHA!", "disha"],
    ["@दृष्टि, समान मामले बताइए।", "drishti"],
    ["@दिशा agla step kya hai?", "disha"],
  ] as const)("routes an explicit handle directly: %s", (text, target) => {
    expect(resolveAgentAddress(text, "saathi")).toEqual({ kind: "mention", target, initialAgent: target });
  });

  it.each(["Disha, what can I do next?", "Can Drishti help me compare?", "दिशा, आगे क्या करूँ?"])("routes a written name through Saathi: %s", text => {
    const address = resolveAgentAddress(text);
    expect(address.kind).toBe("name");
    expect(address.initialAgent).toBe("saathi");
    expect(address.target).toBe(text.includes("Drishti") ? "drishti" : "disha");
  });

  it("gives explicit handles priority over a plain name and the selector", () => {
    expect(resolveAgentAddress("Saathi, let @Disha continue.", "drishti")).toEqual({ kind: "mention", target: "disha", initialAgent: "disha" });
    expect(resolveAgentAddress("@Drishti and @Disha, help me.").target).toBe("drishti");
  });

  it.each([
    "Email foo@disha.com or see https://example.org/Drishti.",
    "Do not rename this disharmony report.",
    "The quote was `@Disha` and the evidence says:\n> Drishti wrote this.",
    "@staff @disha-admin @drishti.example are not agent handles.",
  ])("does not promote unrelated tokens or quoted material into a recipient: %s", text => {
    expect(resolveAgentAddress(text)).toEqual({ kind: "selected", target: "saathi", initialAgent: "saathi" });
  });

  it("uses the chosen recipient, defaulting to Saathi, when there is no address", () => {
    expect(resolveAgentAddress("Please help me.").initialAgent).toBe("saathi");
    expect(resolveAgentAddress("Please help me.", "disha").initialAgent).toBe("disha");
  });
});
