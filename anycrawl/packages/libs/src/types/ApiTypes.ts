import { Request } from "express";

export interface RequestWithAuth extends Request {
    auth?: {
        uuid: string;
        user?: string;
        key: string;
        name: string;
        isActive: boolean;
        createdBy: number;
        hashedKey: string;
        salt: string;
        credits: number;
        createdAt: Date;
        lastUsedAt?: Date;
        expiresAt?: Date;
    };
    creditsUsed?: number;
    checkCredits?: boolean;
    jobId?: string;
}
