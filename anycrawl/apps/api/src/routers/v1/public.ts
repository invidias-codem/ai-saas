import express, { Router, Request, Response, NextFunction } from "express";
import { FileController } from "../../controllers/v1/FileController.js";
import { controllerWrapper } from "../../utils/AsyncHandler.js";

// Simple in-memory rate limiter for public endpoints (no external dependency)
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();
function simpleRateLimit(maxRequests: number, windowMs: number) {
    return (req: Request, res: Response, next: NextFunction) => {
        const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || 'unknown';
        const now = Date.now();
        const entry = rateLimitStore.get(ip);

        if (!entry || now > entry.resetAt) {
            rateLimitStore.set(ip, { count: 1, resetAt: now + windowMs });
            return next();
        }

        entry.count++;
        if (entry.count > maxRequests) {
            res.status(429).json({ error: 'Too many requests. Please slow down.' });
            return;
        }
        next();
    };
}

const router: express.Router = Router();
const fileController = new FileController();

// Rate limit: 60 requests per minute per IP on public storage endpoint
router.get("/storage/file/:path", simpleRateLimit(60, 60_000), controllerWrapper(fileController.handle));

export default router;
