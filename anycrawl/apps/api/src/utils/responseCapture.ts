import { Response } from "express";

export interface CapturedResponse extends Response {
    capturedBody?: any;
}

export const captureResponseBody = (res: Response): CapturedResponse => {
    const capturedRes = res as CapturedResponse;
    const originalSend = res.send;

    capturedRes.send = function (body?: any): Response {
        capturedRes.capturedBody = body;
        return originalSend.call(this, body);
    };

    return capturedRes;
}; 