"use client";

import type { Copy } from "@/lib/copy";
import type { AgentId } from "@/lib/demo-state";

export const AGENTS: AgentId[] = ["saathi", "drishti", "disha"];
export const AGENT_NAMES = { saathi: "Saathi", drishti: "Drishti", disha: "Disha" };
export const roleFor = (copy: Copy, agent: AgentId) => copy[`${agent}Role`];

