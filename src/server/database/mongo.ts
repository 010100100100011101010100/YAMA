import "server-only";
import { MongoClient } from "mongodb";
import { getServerConfig } from "@/server/config";

// Retain one small pool across Next development reloads.
const shared = globalThis as typeof globalThis & { yamaMongo?: MongoClient };

export function getMongoClient() {
  shared.yamaMongo ??= new MongoClient(getServerConfig().mongoUri, {
    maxPoolSize: 5, minPoolSize: 0, serverSelectionTimeoutMS: 5000,
    appName: "yama-local", retryWrites: true,
  });
  return shared.yamaMongo;
}

export function getDatabase() {
  return getMongoClient().db(getServerConfig().mongoDatabase);
}
