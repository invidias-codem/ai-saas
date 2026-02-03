
import axios from 'axios';
import * as cheerio from 'cheerio';
import { GoogleAIFileManager, FileState } from "@google/generative-ai/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { requireEnv } from "@/lib/env";
import fs from "fs";
import path from "path";
import os from "os";

// Initialize Gemini components
// Note: GoogleAIFileManager is part of @google/generative-ai/server in recent versions
// If this import fails, ensures npm install @google/generative-ai@latest was run
// Lazy initialize
function getModel() {
    const genAI = new GoogleGenerativeAI(requireEnv('GOOGLE_API_KEY'));
    return genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
}

function getFileManager() {
    return new GoogleAIFileManager(requireEnv('GOOGLE_API_KEY'));
}

export interface AcademicPaper {
    title: string;
    authors: string[];
    summary: string;
    pdfUrl: string;
    publishedAt: string;
    source: 'arxiv' | 'scholar';
};

/**
 * Searches arXiv for research papers.
 * @param query The search query
 * @param maxResults Number of results to return (default 5)
 */
export async function searchArxiv(query: string, maxResults = 5): Promise<AcademicPaper[]> {
    try {
        console.log(`[Academic] Searching arXiv for: "${query}"`);
        const response = await axios.get('http://export.arxiv.org/api/query', {
            params: {
                search_query: `all:${query}`,
                start: 0,
                max_results: maxResults,
                sortBy: 'relevance',
                sortOrder: 'descending'
            }
        });

        const $ = cheerio.load(response.data, { xmlMode: true });
        const papers: AcademicPaper[] = [];

        $('entry').each((_, element) => {
            const entry = $(element);
            const title = entry.find('title').text().trim();
            const summary = entry.find('summary').text().trim();
            const publishedAt = entry.find('published').text().trim();
            const authors: string[] = [];

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
    } catch (error) {
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
export async function analyzePaperWithGemini(pdfUrl: string, userQuery: string) {
    const tempFilePath = path.join(os.tmpdir(), `paper-${Date.now()}.pdf`);

    try {
        console.log(`[Academic] Downloading PDF from ${pdfUrl}...`);
        const response = await axios.get(pdfUrl, { responseType: 'arraybuffer' });
        fs.writeFileSync(tempFilePath, Buffer.from(response.data));

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
        while (fileState.state === FileState.PROCESSING) {
            console.log(`[Academic] File processing...`);
            await new Promise((resolve) => setTimeout(resolve, 2000));
            fileState = await fileManager.getFile(uploadResult.file.name);
        }

        if (fileState.state === FileState.FAILED) {
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
        fs.unlinkSync(tempFilePath);

        return responseText;

    } catch (error) {
        console.error('[Academic] Analysis failed:', error);
        // Cleanup on error
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
        return `Failed to analyze paper: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
}
