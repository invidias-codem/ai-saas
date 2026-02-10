import { randomBytes } from "crypto";
import { getDB, schemas, eq } from "@anycrawl/db";

function generateApiKey(): string {
    // ac- prefix + 32 non-hex alphanumeric characters
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    const bytes = randomBytes(32);
    let id = "";
    for (let i = 0; i < 32; i++) {
        const byte = bytes[i]!; // i is within range; non-null assertion is safe
        id += alphabet.charAt(byte % alphabet.length);
    }
    return `ac-${id}`;
}

async function main(): Promise<void> {
    try {
        const db = await getDB();
        const defaultName = process.argv[2] || "default";

        // Always generate a new key and insert a new row

        const key = generateApiKey();
        const now = new Date();

        await db.insert(schemas.apiKey).values({
            key,
            name: defaultName,
            isActive: true,
            createdBy: -1,
            createdAt: now,
            credits: 999999,
        });

        // Fetch the inserted row to show identifiers
        const [inserted] = await db
            .select()
            .from(schemas.apiKey)
            .where(eq(schemas.apiKey.key, key))
            .limit(1);

        const insertedRow = inserted as any;
        console.log("API key generated successfully.");
        if (insertedRow?.uuid) console.log(`uuid: ${insertedRow.uuid}`);
        console.log(`name: ${defaultName}`);
        console.log(`key: ${key}`);
        if (insertedRow?.credits !== undefined) console.log(`credits: ${insertedRow.credits}`);
        process.exit(0);
    } catch (err) {
        console.error("Failed to generate API key:", err);
        process.exit(1);
    }
}

main();


