import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "./generated/prisma/client";

export type DatabaseClient = PrismaClient;

export interface CreateDatabaseClientOptions {
  connectionString?: string;
}

export function createDatabaseClient(
  options: CreateDatabaseClientOptions = {},
): DatabaseClient {
  const connectionString = options.connectionString ?? process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is required to create the database client.");
  }

  const adapter = new PrismaPg({ connectionString });

  return new PrismaClient({ adapter });
}
