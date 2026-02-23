import { defineConfig } from "drizzle-kit";

if (!process.env.ANYCRAWL_API_DB_CONNECTION) {
    throw new Error("ANYCRAWL_API_DB_CONNECTION environment variable is required");
}

const nameMap = {
    postgresql: "PostgreSQL",
    sqlite: "SQLite",
};

const dbType = nameMap[process.env.ANYCRAWL_API_DB_TYPE as keyof typeof nameMap];

if (!dbType) {
    throw new Error(
        `Unsupported database type: ${process.env.ANYCRAWL_API_DB_TYPE}. Please set ANYCRAWL_API_DB_TYPE to one of: postgresql, sqlite`
    );
}

export default defineConfig({
    dialect: process.env.ANYCRAWL_API_DB_TYPE as unknown as "postgresql" | "mysql" | "sqlite",
    schema: `./src/db/schemas/${dbType}.ts`,
    out: `./drizzle/${dbType}`,
    dbCredentials: {
        url: process.env.ANYCRAWL_API_DB_CONNECTION,
    },
});
