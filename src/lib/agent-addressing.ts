import type { AgentId } from "./demo-state";

export type AgentAddress = { kind: "mention" | "name" | "selected"; target: AgentId; initialAgent: AgentId };
export const AGENT_ALIASES: Record<string, AgentId> = {
  saathi: "saathi", "साथी": "saathi",
  drishti: "drishti", "दृष्टि": "drishti", "दृष्टी": "drishti",
  disha: "disha", "दिशा": "disha",
};
const names = Object.keys(AGENT_ALIASES).join("|");
const boundary = "(?![\\p{L}\\p{M}\\p{N}_-]|\\.[\\p{L}\\p{N}])";

// A quoted excerpt, URL, or email is source material, not an addressing control.
function addressableText(text: string) {
  return text.replace(/```[\s\S]*?(?:```|$)|`[^`\n]*`|^\s*>[^\n]*|https?:\/\/\S+|[\w.+-]+@[\w.-]+/gmu, " ");
}

export function resolveAgentAddress(text: string, selected: AgentId = "saathi"): AgentAddress {
  const source = addressableText(text);
  const mention = new RegExp(`(^|[^\\p{L}\\p{M}\\p{N}_/@.-])@(${names})${boundary}`, "iu").exec(source);
  if (mention) {
    const target = AGENT_ALIASES[mention[2].toLowerCase()];
    return { kind: "mention", target, initialAgent: target };
  }
  const named = new RegExp(`(^|[^\\p{L}\\p{M}\\p{N}_/@.-])(${names})${boundary}`, "iu").exec(source);
  if (named) return { kind: "name", target: AGENT_ALIASES[named[2].toLowerCase()], initialAgent: "saathi" };
  return { kind: "selected", target: selected, initialAgent: selected };
}

export function requestedHandoff(address: AgentAddress | undefined, agent: AgentId, depth: number): AgentId | null {
  return address?.kind === "name" && agent === "saathi" && depth === 0 && address.target !== agent ? address.target : null;
}
