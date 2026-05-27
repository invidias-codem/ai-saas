"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatMessageSchema = void 0;
const zod_1 = require("zod");
exports.ChatMessageSchema = zod_1.z.object({
    role: zod_1.z.enum(["user", "assistant", "system", "model", "bot"]),
    text: zod_1.z.string(),
    attachments: zod_1.z.array(zod_1.z.object({
        name: zod_1.z.string().optional(),
        mimeType: zod_1.z.string(),
        base64Data: zod_1.z.string()
    })).optional()
});
