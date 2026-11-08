import mongoose from "mongoose";
import { getMongoUri } from "@/lib/config";
import { logger } from "@/lib/logger";

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  // eslint-disable-next-line no-var
  var __mycloudMongoose: MongooseCache | undefined;
}

const cached: MongooseCache =
  global.__mycloudMongoose ?? (global.__mycloudMongoose = { conn: null, promise: null });

export async function connectDB(): Promise<typeof mongoose> {
  if (cached.conn) return cached.conn;
  if (!cached.promise) {
    mongoose.set("strictQuery", true);
    // NOTE: Do not enable `sanitizeFilter` globally. It wraps legitimate
    // operators such as { $lte: date } in { $eq: ... }, which breaks range
    // queries. NoSQL injection is prevented at the edge: every user-supplied
    // object is parsed by a strict Zod schema and object IDs are validated
    // before reaching a query.
    cached.promise = mongoose
      .connect(getMongoUri(), {
        autoIndex: process.env.NODE_ENV !== "production",
        serverSelectionTimeoutMS: 5_000,
        socketTimeoutMS: 45_000,
        maxPoolSize: 20,
        bufferCommands: false,
      })
      .then((connection) => {
        logger.info("MongoDB connected", { database: connection.connection.name });
        connection.connection.on("disconnected", () => {
          logger.warn("MongoDB disconnected");
          cached.conn = null;
          cached.promise = null;
        });
        connection.connection.on("error", (error) => {
          logger.error("MongoDB connection error", { error });
        });
        return connection;
      })
      .catch((error) => {
        cached.promise = null;
        logger.error("MongoDB connection failed", { error });
        throw error;
      });
  }
  cached.conn = await cached.promise;
  return cached.conn;
}

export async function databaseHealth(): Promise<{ ok: boolean; latencyMs?: number; error?: string }> {
  try {
    const connection = await connectDB();
    const started = Date.now();
    if (connection.connection.db) {
      await connection.connection.db.admin().ping();
    }
    return { ok: true, latencyMs: Date.now() - started };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Database unavailable" };
  }
}
