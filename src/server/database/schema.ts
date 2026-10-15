import "server-only";
import type { Db } from "mongodb";

const definitions = {
  reports: { required: ["_id", "ownerId", "schemaVersion", "synthetic", "revision", "messages", "assertions", "createdAt", "updatedAt"], properties: {
    _id: { bsonType: "string" }, ownerId: { bsonType: "string" }, schemaVersion: { enum: [1] }, synthetic: { enum: [true] },
    revision: { bsonType: ["int", "double"], minimum: 1 }, messages: { bsonType: "array", maxItems: 50 }, assertions: { bsonType: "array", maxItems: 100 },
    createdAt: { bsonType: "date" }, updatedAt: { bsonType: "date" },
    agentTaskCount: { bsonType: ["int", "double"], minimum: 0, maximum: 20 }, agentTaskFence: { bsonType: ["int", "double"], minimum: 0 },
  } },
  report_revisions: { required: ["_id", "ownerId", "reportId", "revision", "kind", "snapshot"], properties: {
    _id: { bsonType: "string" }, ownerId: { bsonType: "string" }, reportId: { bsonType: "string" },
    kind: { enum: ["draft", "confirmed"] }, snapshot: { bsonType: "object" },
  } },
  graph_outbox: { required: ["_id", "ownerId", "reportId", "revision", "status", "attempts", "dueAt"], properties: {
    _id: { bsonType: "string" }, ownerId: { bsonType: "string" }, reportId: { bsonType: "string" },
    status: { enum: ["pending", "processing", "done", "superseded", "failed"] }, attempts: { bsonType: ["int", "double"], minimum: 0 }, dueAt: { bsonType: "date" },
  } },
  catalogue: { required: ["_id", "synthetic", "published", "title", "summary", "patterns"], properties: {
    _id: { bsonType: "string" }, synthetic: { enum: [true] }, published: { bsonType: "bool" }, title: { bsonType: "string" }, summary: { bsonType: "string" }, patterns: { bsonType: "array" },
  } },
  evidence: { required: ["_id", "ownerId", "reportId", "uploadKey", "name", "size", "sha256", "status", "extractor", "createdRevision", "createdAt", "removedAt"], properties: {
    _id: { bsonType: "string" }, ownerId: { bsonType: "string" }, reportId: { bsonType: "string" }, uploadKey: { bsonType: "string" }, name: { bsonType: "string", maxLength: 120 },
    size: { bsonType: ["int", "double"], minimum: 1, maximum: 5242880 }, sha256: { bsonType: "string", pattern: "^[a-f0-9]{64}$" },
    status: { enum: ["stored", "queued", "processing", "ready", "failed", "canceled"] }, extractor: { enum: ["utf8-v1", "local-doc-v1"] }, text: { bsonType: ["string", "null"], maxLength: 6000 },
    format: { enum: ["text", "pdf", "png", "jpeg"] }, extraction: { bsonType: ["object", "null"] }, attempts: { bsonType: ["int", "double"], minimum: 0 }, leaseUntil: { bsonType: ["date", "null"] },
    createdRevision: { bsonType: ["int", "double"], minimum: 1 }, createdAt: { bsonType: "date" }, removedAt: { bsonType: ["date", "null"] },
  } },
  evidence_worker_lock: { required: ["_id", "claimToken", "leaseUntil"], properties: { _id: { bsonType: "string" }, claimToken: { bsonType: ["string", "null"] }, leaseUntil: { bsonType: "date" } } },
  agent_tasks: { required: ["_id", "ownerId", "reportId", "requestKey", "revision", "agent", "tool", "status", "attempts", "adapter", "createdAt", "updatedAt"], properties: {
    _id: { bsonType: "string" }, ownerId: { bsonType: "string" }, reportId: { bsonType: "string" }, requestKey: { bsonType: "string" }, revision: { bsonType: ["int", "double"], minimum: 1 },
    agent: { enum: ["saathi"] }, tool: { enum: ["propose_draft_assertions"] }, status: { enum: ["queued", "running", "ready", "failed", "canceled", "stale", "accepted"] },
    attempts: { bsonType: ["int", "double"], minimum: 0, maximum: 4 }, adapter: { bsonType: "object" }, result: { bsonType: ["object", "null"] }, resultHash: { bsonType: ["string", "null"] },
    createdAt: { bsonType: "date" }, updatedAt: { bsonType: "date" },
  } },
  agent_worker_lock: { required: ["_id", "claimToken", "leaseUntil"], properties: { _id: { bsonType: "string" }, claimToken: { bsonType: ["string", "null"] }, leaseUntil: { bsonType: "date" } } },
  provider_budgets: { required: ["_id", "reservedCalls"], properties: { _id: { enum: ["openai-synthetic-demo"] }, reservedCalls: { bsonType: ["int", "double"], minimum: 0, maximum: 100 } } },
  dialogues: { required: ["_id", "ownerId", "version", "activeAgent", "automatic", "language", "messages", "turn", "requests", "updatedAt"], properties: {
    _id: { bsonType: "string" }, ownerId: { bsonType: "string" }, version: { bsonType: ["int", "double"], minimum: 0 },
    activeAgent: { enum: ["saathi", "drishti", "disha"] }, automatic: { bsonType: "bool" }, messages: { bsonType: "array", maxItems: 60 },
    language: { enum: ["en", "hi", "hinglish"] },
    requests: { bsonType: "array", maxItems: 20 }, turn: { bsonType: ["object", "null"] }, updatedAt: { bsonType: "date" },
  } },
  action_reviews: { required: ["_id", "ownerId", "reportId", "revision", "receipt", "reviewedAt", "preview"], properties: {
    _id: { bsonType: "string" }, ownerId: { bsonType: "string" }, reportId: { bsonType: "string" }, revision: { bsonType: ["int", "double"], minimum: 1 },
    receipt: { bsonType: "string", pattern: "^[a-f0-9]{64}$" }, reviewedAt: { bsonType: "date" }, preview: { bsonType: "object" },
  } },
  voice_sessions: { required: ["_id", "id", "ownerId", "revision", "language", "status", "expiresAt", "transcripts"], properties: {
    _id: { bsonType: "string" }, id: { bsonType: "string" }, ownerId: { bsonType: "string" }, revision: { bsonType: ["int", "double"], minimum: 1 }, language: { enum: ["en", "hi", "hinglish"] },
    status: { enum: ["queued", "listening", "stopped", "failed", "stale"] }, expiresAt: { bsonType: "date" }, transcripts: { bsonType: "array", maxItems: 8 }, partial: { bsonType: "string", maxLength: 6000 },
  } },
  voice_playouts: { required: ["_id", "ownerId", "reportId", "sessionId", "turnId", "status", "nonce", "expiresAt"], properties: {
    _id: { bsonType: "string" }, ownerId: { bsonType: "string" }, reportId: { bsonType: "string" }, sessionId: { bsonType: "string" }, turnId: { bsonType: "string" }, nonce: { bsonType: "string" },
    status: { enum: ["preparing", "ready", "failed", "canceled", "played"] }, audio: { bsonType: ["binData", "null"] }, expiresAt: { bsonType: "date" },
  } },
  voice_budgets: { required: ["_id", "reservedSeconds", "reservedCalls"], properties: { _id: { enum: ["sarvam-demo"] }, reservedSeconds: { bsonType: ["int", "double"], minimum: 0 }, reservedCalls: { bsonType: ["int", "double"], minimum: 0 } } },
  public_web_jobs: { required: ["_id","ownerId","reportId","revision","agent","operation","topic","status","requestKey","requestHash","configHash","policy","language","command","createdAt","cacheCreatedAt","expiresAt","attempts","adapter","result","claimToken","leaseUntil"], properties: {
    _id: {bsonType:"string"},ownerId:{bsonType:"string"},reportId:{bsonType:"string"},revision:{bsonType:["int","double"],minimum:1},agent:{enum:["drishti","disha"]},
    operation:{enum:["search_public_web","fetch_public_page"]},topic:{enum:["cyber_reporting","consumer_reporting","cyber_safety"]},status:{enum:["queued","running","ready","failed","canceled","stale"]},
    requestKey:{bsonType:"string"},requestHash:{bsonType:"string"},configHash:{bsonType:"string"},policy:{bsonType:"string"},language:{enum:["en","hi","hinglish"]},command:{bsonType:"object"},result:{bsonType:["object","null"]},adapter:{bsonType:"object"},
    attempts:{bsonType:["int","double"],minimum:0,maximum:1},createdAt:{bsonType:"date"},cacheCreatedAt:{bsonType:"date"},expiresAt:{bsonType:"date"},claimToken:{bsonType:["string","null"]},leaseUntil:{bsonType:["date","null"]},
  } },
  public_web_budgets: {required:["_id","reservedSearches","reservedPages","reservedExaMicroUsd","reservedFirecrawlCredits","blocked"],properties:{_id:{enum:["public-web-demo"]},
    reservedSearches:{bsonType:["int","double"],minimum:0},reservedPages:{bsonType:["int","double"],minimum:0},reservedExaMicroUsd:{bsonType:["int","double"],minimum:0},reservedFirecrawlCredits:{bsonType:["int","double"],minimum:0},blocked:{bsonType:"bool"}}},
  public_web_worker_lock: {required:["_id","claimToken","leaseUntil"],properties:{_id:{bsonType:"string"},claimToken:{bsonType:["string","null"]},leaseUntil:{bsonType:"date"}}},
  notification_recipients: {required:["_id","ownerId","mode","address","verification","active","verifiedAt","approvalFence"],properties:{_id:{bsonType:"string"},ownerId:{bsonType:"string"},mode:{enum:["fixture","live"]},address:{bsonType:"string",maxLength:254},verification:{enum:["fixture","operator_confirmed_synthetic"]},active:{bsonType:"bool"},verifiedAt:{bsonType:"date"},approvalFence:{bsonType:["int","double"],minimum:0}}},
  notification_jobs: {required:["_id","ownerId","reportId","revision","logicalHash","configHash","receipt","recipient","content","status","provider","attempts","createdAt","expiresAt","approvedAt","requestKey","outcomes"],properties:{
    _id:{bsonType:"string"},ownerId:{bsonType:"string"},reportId:{bsonType:"string"},revision:{bsonType:["int","double"],minimum:1},logicalHash:{bsonType:"string"},configHash:{bsonType:"string"},receipt:{bsonType:"string"},recipient:{bsonType:"object"},content:{bsonType:"object"},
    status:{enum:["draft","queued","dispatching","captured","accepted","failed","delivery_unknown","canceled","stale","expired"]},provider:{enum:["fixture","resend","gmail"]},attempts:{bsonType:["int","double"],minimum:0,maximum:2},
    createdAt:{bsonType:"date"},expiresAt:{bsonType:"date"},approvedAt:{bsonType:["date","null"]},requestKey:{bsonType:["string","null"]},outcomes:{bsonType:"array",maxItems:2},
  }},
  notification_budgets: {required:["_id","reservedAttempts"],properties:{_id:{enum:["mail-synthetic-demo"]},reservedAttempts:{bsonType:["int","double"],minimum:0}}},
  notification_worker_lock: {required:["_id","claimToken","leaseUntil"],properties:{_id:{bsonType:"string"},claimToken:{bsonType:["string","null"]},leaseUntil:{bsonType:"date"}}},
  chat_statuses: {required:["_id","ownerId","resolution","version","updatedAt"],properties:{_id:{bsonType:"string"},ownerId:{bsonType:"string"},resolution:{enum:["unresolved","resolved"]},version:{bsonType:["int","double"],minimum:1},updatedAt:{bsonType:"date"}}},
  billing_purchases:{required:["_id","ownerId","scope","requestKey","status","productId","businessId","createdAt","expiresAt"],properties:{_id:{bsonType:"string"},ownerId:{bsonType:"string"},scope:{enum:["fixture","dodo_test"]},requestKey:{bsonType:"string"},status:{enum:["creating","ready","creation_unknown","failed","paid","reversed","expired"]},productId:{bsonType:"string"},businessId:{bsonType:"string"},createdAt:{bsonType:"date"},expiresAt:{bsonType:"date"}}},
  billing_events:{required:["_id","scope","webhookId","rawHash","event","status","attempts","dueAt","createdAt"],properties:{_id:{bsonType:"string"},scope:{enum:["fixture","dodo_test"]},webhookId:{bsonType:"string"},rawHash:{bsonType:"string"},event:{bsonType:"object"},status:{enum:["pending","processing","done","failed"]},attempts:{bsonType:["int","double"],minimum:0,maximum:3},dueAt:{bsonType:"date"},createdAt:{bsonType:"date"}}},
  billing_grants:{required:["_id","ownerId","scope","purchaseId","paymentId","total","remaining","active","createdAt"],properties:{_id:{bsonType:"string"},ownerId:{bsonType:"string"},scope:{enum:["fixture","dodo_test"]},purchaseId:{bsonType:"string"},paymentId:{bsonType:"string"},total:{enum:[10]},remaining:{bsonType:["int","double"],minimum:0,maximum:10},active:{bsonType:"bool"},createdAt:{bsonType:"date"}}},
  billing_reversals:{required:["_id","scope","paymentId","reason","createdAt"],properties:{_id:{bsonType:"string"},scope:{enum:["fixture","dodo_test"]},paymentId:{bsonType:"string"},reason:{bsonType:"string"},createdAt:{bsonType:"date"}}},
  billing_accounts:{required:["_id","ownerId","scope","fence"],properties:{_id:{bsonType:"string"},ownerId:{bsonType:"string"},scope:{enum:["fixture","dodo_test"]},fence:{bsonType:["int","double"],minimum:0}}},
  billing_budget:{required:["_id","reservedCalls"],properties:{_id:{enum:["dodo-test"]},reservedCalls:{bsonType:["int","double"],minimum:0}}},
  billing_worker_lock:{required:["_id","claimToken","leaseUntil"],properties:{_id:{bsonType:"string"},claimToken:{bsonType:["string","null"]},leaseUntil:{bsonType:"date"}}},
  intelligence_batches:{required:["_id","ownerId","reportId","revision","fingerprint","receipt","sourceReceipt","details","createdAt"],properties:{_id:{bsonType:"string"},ownerId:{bsonType:"string"},reportId:{bsonType:"string"},revision:{bsonType:["int","double"],minimum:1},fingerprint:{bsonType:"string"},receipt:{bsonType:"string"},sourceReceipt:{bsonType:"object"},details:{bsonType:"array",maxItems:20},createdAt:{bsonType:"date"}}},
  intelligence_accesses:{required:["_id","ownerId","scope","batchId","detailId","grantId","createdAt"],properties:{_id:{bsonType:"string"},ownerId:{bsonType:"string"},scope:{enum:["fixture","dodo_test"]},batchId:{bsonType:"string"},detailId:{bsonType:"string"},grantId:{bsonType:["string","null"]},createdAt:{bsonType:"date"}}},
  billing_consumptions:{required:["_id","ownerId","scope","key","batchId","detailId","grantId","charged","createdAt"],properties:{_id:{bsonType:"string"},ownerId:{bsonType:"string"},scope:{enum:["fixture","dodo_test"]},key:{bsonType:"string"},batchId:{bsonType:"string"},detailId:{bsonType:"string"},grantId:{bsonType:["string","null"]},charged:{enum:[0,1]},createdAt:{bsonType:"date"}}},
};

// Idempotent, additive bootstrap. No collection or data is dropped.
export async function initializeSchema(database: Db) {
  const existing = new Set((await database.listCollections({}, { nameOnly: true }).toArray()).map(collection => collection.name));
  for (const [name, definition] of Object.entries(definitions)) {
    const validator = { $jsonSchema: { bsonType: "object", ...definition } };
    if (existing.has(name)) await database.command({ collMod: name, validator, validationLevel: "strict", validationAction: "error" });
    else await database.createCollection(name, { validator, validationLevel: "strict", validationAction: "error" });
  }
  await database.collection("reports").createIndexes([
    { key: { ownerId: 1, creationKey: 1 }, unique: true, name: "owner_creation_key" },
    { key: { ownerId: 1, updatedAt: -1 }, name: "owner_recent_reports" },
  ]);
  await database.collection("report_revisions").createIndex({ ownerId: 1, reportId: 1, revision: 1, kind: 1 }, { unique: true });
  await database.collection("graph_outbox").createIndex({ status: 1, dueAt: 1, leaseUntil: 1 });
  await database.collection("evidence").createIndexes([
    { key: { ownerId: 1, reportId: 1, uploadKey: 1 }, unique: true, name: "owner_report_upload_key" },
    { key: { ownerId: 1, reportId: 1, sha256: 1 }, unique: true, name: "owner_report_content_hash" },
    { key: { ownerId: 1, reportId: 1, removedAt: 1, createdAt: 1 }, name: "owner_report_files" },
    { key: { status: 1, removedAt: 1, requestedAt: 1, leaseUntil: 1 }, name: "document_processing_queue" },
  ]);
  await database.collection<{ _id: string; claimToken: string | null; leaseUntil: Date }>("evidence_worker_lock").updateOne({ _id: "parser" }, { $setOnInsert: { claimToken: null, leaseUntil: new Date(0) } }, { upsert: true });
  await database.collection("agent_tasks").createIndexes([
    { key: { ownerId: 1, reportId: 1, requestKey: 1 }, unique: true, name: "owner_report_agent_request" },
    { key: { ownerId: 1, reportId: 1, createdAt: -1 }, name: "owner_report_agent_history" },
    { key: { status: 1, leaseUntil: 1, createdAt: 1 }, name: "agent_queue" },
  ]);
  await database.collection("dialogues").createIndex({ "turn.status": 1, "turn.leaseUntil": 1, updatedAt: 1 }, { name: "dialogue_queue" });
  await database.collection("action_reviews").createIndex({ ownerId: 1, reportId: 1, receipt: 1 }, { unique: true, name: "owner_report_action_receipt" });
  await database.collection("voice_sessions").createIndex({ status: 1, expiresAt: 1 });
  await database.collection("voice_playouts").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  await database.collection("public_web_jobs").createIndexes([
    {key:{ownerId:1,reportId:1,requestKey:1},unique:true,name:"owned_public_web_request"},
    {key:{status:1,leaseUntil:1,createdAt:1},name:"public_web_queue"},
    {key:{expiresAt:1},expireAfterSeconds:0,name:"public_web_expiry"},
  ]);
  await database.collection<{_id:string;claimToken:string|null;leaseUntil:Date}>("public_web_worker_lock").updateOne({_id:"web"},{$setOnInsert:{claimToken:null,leaseUntil:new Date(0)}},{upsert:true});
  await database.collection("notification_recipients").createIndex({ownerId:1,mode:1},{unique:true,name:"owned_mail_recipient"});
  await database.collection("notification_jobs").createIndexes([
    {key:{ownerId:1,reportId:1,logicalHash:1},unique:true,name:"owned_logical_notification"},
    {key:{ownerId:1,reportId:1,requestKey:1},unique:true,partialFilterExpression:{requestKey:{$type:"string"}},name:"owned_notification_approval"},
    {key:{status:1,leaseUntil:1,createdAt:1},name:"notification_queue"},
  ]);
  await database.collection<{_id:string;claimToken:string|null;leaseUntil:Date}>("notification_worker_lock").updateOne({_id:"mail"},{$setOnInsert:{claimToken:null,leaseUntil:new Date(0)}},{upsert:true});
  await database.collection("billing_purchases").createIndexes([{key:{ownerId:1,scope:1,requestKey:1},unique:true,name:"owned_checkout_request"},{key:{scope:1,sessionId:1},unique:true,partialFilterExpression:{sessionId:{$type:"string"}},name:"provider_checkout_binding"}]);
  await database.collection("billing_events").createIndex({scope:1,status:1,dueAt:1,leaseUntil:1,createdAt:1});
  await database.collection("billing_grants").createIndex({scope:1,purchaseId:1},{unique:true,name:"one_purchase_grant"});
  await database.collection("intelligence_batches").createIndex({ownerId:1,reportId:1,revision:1,fingerprint:1},{unique:true,name:"owned_intelligence_snapshot"});
  await database.collection("intelligence_accesses").createIndex({ownerId:1,scope:1,batchId:1,detailId:1},{unique:true,name:"owned_detail_access"});
  await database.collection("billing_consumptions").createIndex({ownerId:1,scope:1,key:1},{unique:true,name:"owned_credit_request"});
  await database.collection<{_id:string;claimToken:string|null;leaseUntil:Date}>("billing_worker_lock").updateOne({_id:"billing"},{$setOnInsert:{claimToken:null,leaseUntil:new Date(0)}},{upsert:true});
  await database.collection<{ _id: string; claimToken: string | null; leaseUntil: Date }>("agent_worker_lock").updateOne({ _id: "agent" }, { $setOnInsert: { claimToken: null, leaseUntil: new Date(0) } }, { upsert: true });
  await database.collection("session").createIndexes([
    { key: { token: 1 }, unique: true }, { key: { expiresAt: 1 }, expireAfterSeconds: 0 }, { key: { userId: 1 } },
  ]);
  await database.collection("user").createIndex({ email: 1 }, { unique: true });
  await database.collection("account").createIndex({ providerId: 1, accountId: 1 }, { unique: true });
  await database.collection("verification").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  await database.collection("rateLimit").createIndex({ key: 1 }, { unique: true });
  await database.collection("api_limits").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
}
