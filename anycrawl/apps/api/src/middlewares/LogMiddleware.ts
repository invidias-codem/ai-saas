import { Response, NextFunction } from "express";
import { getDB, schemas } from "@anycrawl/db";
import { log } from "@anycrawl/libs/log";
import { captureResponseBody, CapturedResponse } from "../utils/responseCapture.js";
import { RequestWithAuth } from "@anycrawl/libs";

export const logMiddleware = async (req: RequestWithAuth, res: Response, next: NextFunction) => {
    // Skip logging for health check endpoint
    if (req.path === '/health') {
        return next();
    }

    // Capture response body
    const capturedRes = captureResponseBody(res);

    res.on("finish", () => {
        // Create complete request payload
        const requestPayload = {
            body: req.body,
            query: req.query,
            params: req.params,
        };
        const responseHeaders = res.getHeaders();
        // Filter out any null prototype objects from response headers
        const filteredHeaders = Object.fromEntries(
            Object.entries(responseHeaders).filter(([_, value]) => value != null)
        );
        // Check if responseBody is a valid JSON string
        let parsedResponseBody;
        try {
            parsedResponseBody = JSON.parse(capturedRes.capturedBody);
        } catch (e) {
            // If parsing fails, use the original response body
            parsedResponseBody = capturedRes.capturedBody;
        }
        const logEntry = {
            apiKey: req.auth?.uuid || null,
            path: req.originalUrl,
            method: req.method,
            statusCode: res.statusCode,
            processingTimeMs: res.getHeader("x-response-time") ? String(res.getHeader("x-response-time")).replace("ms", "") : null,
            // if success request, creditsUsed defaults to 1 unless explicitly set
            creditsUsed: (res.statusCode >= 200 && res.statusCode < 400) ? (req.creditsUsed ?? 1) : 0,
            ipAddress: req.ip || null,
            userAgent: req.headers["user-agent"] || null,
            requestPayload: requestPayload,
            requestHeader: req.headers,
            responseBody: parsedResponseBody,
            responseHeader: filteredHeaders,
            success: res.statusCode >= 200 && res.statusCode < 400,
            createdAt: new Date(),
        };

        // Insert log entry asynchronously
        getDB()
            .then((db) => db.insert(schemas.requestLog).values(logEntry))
            .catch((error: Error) => {
                log.error(`Failed to log request: ${error}, ${JSON.stringify(logEntry)}`);
            });
    });

    next();
};
