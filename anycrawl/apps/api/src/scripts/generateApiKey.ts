import { randomBytes } from "crypto";
import { getDB, schemas, eq } from "@anycrawl/db";

function generateApiKey(): string {
    // ac- prefix + 32 unbiased alphanumeric characters
    // Uses rejection sampling to eliminate modulo bias (byte % 62 is biased for bytes >= 248)
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    const maxUnbiased = 256 - (256 % alphabet.length); // 248 — reject bytes >= this
    let id = "";
    while (id.length < 32) {
        const bytes = randomBytes(64); // batch for efficiency
        for (let i = 0; i < bytes.length && id.length < 32; i++) {
            const byte = bytes[i]!;
            if (byte < maxUnbiased) { // rejection sampling — no modulo bias
                id += alphabet.charAt(byte % alphabet.length);
            }
        }
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


