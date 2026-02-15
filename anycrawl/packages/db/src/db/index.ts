import { drizzle } from "drizzle-orm/node-postgres";
import { drizzle as drizzleSQLite } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as sqliteSchema from "./schemas/SQLite.js";
import * as postgresqlSchema from "./schemas/PostgreSQL.js";
import { Client } from "pg";
import { log } from "@anycrawl/libs/log";

export const schemas = (
    process.env.ANYCRAWL_API_DB_TYPE?.toLowerCase() === "sqlite" ? sqliteSchema : postgresqlSchema
) as any;

let dbInstance: ReturnType<typeof drizzle> | ReturnType<typeof drizzleSQLite> | null = null;

export const initializeDatabase = async () => {
    if (dbInstance) return dbInstance;
    log.info(`Initializing database with type: ${process.env.ANYCRAWL_API_DB_TYPE}`);
    const dbType = process.env.ANYCRAWL_API_DB_TYPE?.toLowerCase() ?? 'sqlite';
    switch (dbType) {
        case "sqlite":
            log.info("Using SQLite database");
            const sqlite = new Database(process.env.ANYCRAWL_API_DB_CONNECTION);
            dbInstance = drizzleSQLite(sqlite, { schema: sqliteSchema });
            return dbInstance;
        case "postgresql":
            log.info("Using PostgreSQL database");
            if (!process.env.ANYCRAWL_API_DB_CONNECTION) {
                throw new Error("Database connection string is required");
            }
            const client = new Client(process.env.ANYCRAWL_API_DB_CONNECTION);
            try {
                await client.connect();
                log.info("PostgreSQL connection established");
                dbInstance = drizzle(client, { schema: postgresqlSchema });
                return dbInstance;
            } catch (error) {
                log.error(`Failed to connect to PostgreSQL: ${error}`);
                throw error;
            }
        default:
            throw new Error(
                `Unsupported database type: ${dbType}. Please set ANYCRAWL_API_DB_TYPE to one of: postgresql, sqlite`
            );
    }
};

// Create a proxy that preserves method chaining
const createChainableProxy = (target: any) => {
    return new Proxy(target, {
        get: (obj, prop) => {
            const value = obj[prop];
            if (typeof value === "function") {
                return (...args: any[]) => {
                    const result = value.apply(obj, args);
                    // If the result is an object, wrap it in a proxy to maintain chaining
                    return typeof result === "object" && result !== null
                        ? createChainableProxy(result)
                        : result;
                };
            }
            // If the value is an object, wrap it in a proxy to maintain chaining
            return typeof value === "object" && value !== null
                ? createChainableProxy(value)
                : value;
        },
    });
};

// Export the database instance getter function
export const getDB = async () => {
    if (!dbInstance) {
        dbInstance = await initializeDatabase();
    }
    return createChainableProxy(dbInstance);
};
