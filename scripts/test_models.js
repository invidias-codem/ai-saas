const { GoogleGenerativeAI } = require("@google/generative-ai");
const dotenv = require("dotenv");
const path = require("path");

// Load env
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function listModels() {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
        console.error("❌ GOOGLE_API_KEY not found in .env.local");
        process.exit(1);
    }

    console.log("Fetching models...");
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        if (data.models) {
            console.log("Found models:");
            data.models.forEach(m => {
                if (m.name.includes("embedding")) {
                    console.log(`- ${m.name}`);
                }
            });
        }

        // specific test for dimensions
        console.log("\nTesting embedding dimension for models/gemini-embedding-001...");
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "models/gemini-embedding-001" });
        const result = await model.embedContent("Hello world test");
        const dim = result.embedding.values.length;
        console.log(`✅ Generated embedding. Dimension: ${dim}`);

    } catch (error) {
        console.error("❌ Error:", error);
    }
}

listModels();
