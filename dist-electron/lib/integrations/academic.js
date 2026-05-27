"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchArxiv = searchArxiv;
exports.analyzePaperWithGemini = analyzePaperWithGemini;
const axios_1 = __importDefault(require("axios"));
const cheerio = __importStar(require("cheerio"));
const server_1 = require("@google/generative-ai/server");
const generative_ai_1 = require("@google/generative-ai");
const env_1 = require("@/lib/env");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
// Initialize Gemini components
// Note: GoogleAIFileManager is part of @google/generative-ai/server in recent versions
// If this import fails, ensures npm install @google/generative-ai@latest was run
// Lazy initialize
function getModel() {
    const genAI = new generative_ai_1.GoogleGenerativeAI((0, env_1.requireEnv)('GOOGLE_API_KEY'));
    return genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
}
function getFileManager() {
    return new server_1.GoogleAIFileManager((0, env_1.requireEnv)('GOOGLE_API_KEY'));
}
;
/**
 * Searches arXiv for research papers.
 * @param query The search query
 * @param maxResults Number of results to return (default 5)
 */
async function searchArxiv(query, maxResults = 5) {
    try {
        console.log(`[Academic] Searching arXiv for: "${query}"`);
        const response = await axios_1.default.get('http://export.arxiv.org/api/query', {
            params: {
                search_query: `all:${query}`,
                start: 0,
                max_results: maxResults,
                sortBy: 'relevance',
                sortOrder: 'descending'
            }
        });
        const $ = cheerio.load(response.data, { xmlMode: true });
        const papers = [];
        $('entry').each((_, element) => {
            const entry = $(element);
            const title = entry.find('title').text().trim();
            const summary = entry.find('summary').text().trim();
            const publishedAt = entry.find('published').text().trim();
            const authors = [];
            entry.find('author name').each((_, nameEl) => {
                authors.push($(nameEl).text().trim());
            });
            const pdfUrl = entry.find('link[title="pdf"]').attr('href') || '';
            if (title && pdfUrl) {
                papers.push({
                    title,
                    authors,
                    summary,
                    pdfUrl,
                    publishedAt,
                    source: 'arxiv'
                });
            }
        });
        return papers;
    }
    catch (error) {
        console.error('Error searching arXiv:', error);
        return [];
    }
}
/**
 * Downloads a PDF from a URL and extracts insights using multimodal analysis.
 * This function bypasses text scraping limitations by letting the model "see" schemas, charts, and math.
 *
 * @param pdfUrl The URL of the PDF to analyze
 * @param userQuery The specific question the user wants answered from the paper
 */
async function analyzePaperWithGemini(pdfUrl, userQuery) {
    const tempFilePath = path_1.default.join(os_1.default.tmpdir(), `paper-${Date.now()}.pdf`);
    try {
        console.log(`[Academic] Downloading PDF from ${pdfUrl}...`);
        const response = await axios_1.default.get(pdfUrl, { responseType: 'arraybuffer' });
        fs_1.default.writeFileSync(tempFilePath, Buffer.from(response.data));
        console.log(`[Academic] Uploading to Gemini File API...`);
        const fileManager = getFileManager();
        const uploadResult = await fileManager.uploadFile(tempFilePath, {
            mimeType: "application/pdf",
            displayName: "Research Paper",
        });
        const fileUri = uploadResult.file.uri;
        console.log(`[Academic] File uploaded: ${fileUri}`);
        // Wait for file to be ready
        let fileState = await fileManager.getFile(uploadResult.file.name);
        while (fileState.state === server_1.FileState.PROCESSING) {
            console.log(`[Academic] File processing...`);
            await new Promise((resolve) => setTimeout(resolve, 2000));
            fileState = await fileManager.getFile(uploadResult.file.name);
        }
        if (fileState.state === server_1.FileState.FAILED) {
            throw new Error("Gemini File API failed to process the PDF.");
        }
        console.log(`[Academic] Analyzing with Gemini 1.5 Pro...`);
        const prompt = `
      You are an expert academic researcher. 
      Analyze the attached research paper to answer the following user question.
      
      User Question: "${userQuery}"
      
      Instructions:
      1. Use specific details from the paper.
      2. If the user asks about architecture, look for diagrams.
      3. If the user asks about performance, look for tables/charts.
      4. Provide clear citations to sections or pages if possible.
    `;
        const result = await getModel().generateContent([
            { fileData: { mimeType: uploadResult.file.mimeType, fileUri: fileUri } },
            { text: prompt },
        ]);
        const responseText = result.response.text();
        // Cleanup: Delete from Gemini (to save storage limits) and local disk
        await fileManager.deleteFile(uploadResult.file.name);
        fs_1.default.unlinkSync(tempFilePath);
        return responseText;
    }
    catch (error) {
        console.error('[Academic] Analysis failed:', error);
        // Cleanup on error
        if (fs_1.default.existsSync(tempFilePath))
            fs_1.default.unlinkSync(tempFilePath);
        return `Failed to analyze paper: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
}
