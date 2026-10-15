import { randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
const path = ".env.local",
  contents = await readFile(path, "utf8");
process.loadEnvFile(path);
const additions = {
  LIVEKIT_URL: "ws://127.0.0.1:7880",
  LIVEKIT_API_KEY: `yama${randomBytes(8).toString("hex")}`,
  LIVEKIT_API_SECRET: randomBytes(32).toString("hex"),
  YAMA_VOICE_PYTHON: `${process.cwd()}/.venv-voice/bin/python`,
  YAMA_VOICE_LIVE_ENABLED: "false",
  YAMA_SARVAM_DATA_POLICY_ACKNOWLEDGED: "false",
  SARVAM_API_KEY: "",
  YAMA_VOICE_SESSION_SECONDS: "120",
  YAMA_VOICE_MAX_SECONDS: "300",
  YAMA_VOICE_MAX_TTS_CALLS: "20",
};
let updated = contents;
for (const [key, value] of Object.entries(additions))
  if (!new RegExp(`^${key}=`, "m").test(contents)) {
    updated += `\n${key}=${value}`;
    process.env[key] = value;
  }
await writeFile(path, updated.trimEnd() + "\n", { mode: 0o600 });
await chmod(path, 0o600);
if (
  !/^[a-zA-Z0-9_-]{4,80}$/.test(process.env.LIVEKIT_API_KEY ?? "") ||
  !/^[a-zA-Z0-9_-]{32,128}$/.test(process.env.LIVEKIT_API_SECRET ?? "")
)
  throw new Error(
    "Invalid local LiveKit credentials; existing values were preserved.",
  );
await mkdir(".local/secrets", { recursive: true });
await writeFile(
  ".local/secrets/livekit-native.yaml",
  `port: 7880\nbind_addresses: ["127.0.0.1"]\nrtc:\n  tcp_port: 0\n  udp_port: 7882\n  node_ip: 127.0.0.1\n  use_external_ip: false\n  enable_loopback_candidate: true\n  ips:\n    includes: ["127.0.0.1/32"]\nkeys:\n  ${process.env.LIVEKIT_API_KEY}: ${process.env.LIVEKIT_API_SECRET}\nroom:\n  empty_timeout: 30\n  max_participants: 2\nlogging:\n  level: warn\n`,
  { mode: 0o600 },
);
await chmod(".local/secrets/livekit-native.yaml", 0o600);
console.log(
  "Local LiveKit secrets prepared; existing enablement settings preserved. No credentials were printed.",
);
