import "server-only";
import { createClient, type RedisFunctions, type RedisScripts } from "@redis/client";
import { Graph, type FalkorDB } from "falkordb";
import commandModule from "falkordb/dist/src/commands/index.js";
import { Single } from "falkordb/dist/src/clients/single.js";

export type GraphClient = Pick<FalkorDB, "selectGraph" | "list" | "close"> & { isReady: () => boolean };
// Native Node ESM and the test/Next bundlers unwrap this CommonJS default differently.
const commands = "default" in commandModule ? commandModule.default as typeof commandModule : commandModule;

export async function connectGraph(host: string, port: number, password: string): Promise<GraphClient> {
  // Reuse FalkorDB's protocol/Graph implementation with bounded node-redis transport.
  // Its 6.8.0 factory emits connection errors before callers can register a listener.
  // Keep that package pinned while using these two internal transport exports.
  const redis = createClient<{ falkordb: typeof commands }, RedisFunctions, RedisScripts, 2>({ modules: { falkordb: commands }, RESP: 2, password,
    socket: { host, port, connectTimeout: 5000, socketTimeout: 5000, reconnectStrategy: false },
    disableOfflineQueue: true, commandsQueueMaxLength: 100, pingInterval: 2500,
  });
  redis.on("error", () => { /* Fail through requests/jobs without logging query data. */ });
  try { await redis.connect(); }
  catch { if (redis.isOpen) redis.destroy(); throw new Error("graph_unavailable"); }
  const connection = new Single(redis);
  return { selectGraph: name => new Graph(connection, name), list: () => connection.list(), isReady: () => redis.isReady,
    close: async () => { if (redis.isOpen) redis.destroy(); },
  };
}
