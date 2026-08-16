import IORedis from "ioredis";

declare global {
  // eslint-disable-next-line no-var
  var __redisConnection: IORedis | undefined;
}

export const redisConnection: IORedis =
  global.__redisConnection ??
  new IORedis(process.env.REDIS_URL ?? "redis://localhost:56379", {
    maxRetriesPerRequest: null, // مطلوب من BullMQ للـ Workers
  });

if (process.env.NODE_ENV !== "production") {
  global.__redisConnection = redisConnection;
}
