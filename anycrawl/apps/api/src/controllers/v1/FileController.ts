import { Response } from "express";
import { z } from "zod";
import { RequestWithAuth } from "@anycrawl/libs";
import { s3 } from "@anycrawl/libs";
import { Utils } from "@anycrawl/scrape/Utils";
import { join } from 'path';

const pathSchema = z.object({
    path: z.string().min(1, "Path is required")
});

export class FileController {
    public handle = async (req: RequestWithAuth, res: Response): Promise<void> => {
        try {
            const { path } = pathSchema.parse({ path: req.params.path });
            if (process.env.ANYCRAWL_STORAGE === 's3') {
                const url = await s3.getTemporaryUrl(path);
                res.redirect(url);
            } else {
                const utils = Utils.getInstance();
                const storageName = utils.getStorageName();
                const projectRoot = join(process.cwd(), '..', '..');
                const filePath = join(projectRoot, 'storage', 'key_value_stores', storageName, path);
                res.sendFile(filePath, (err) => {
                    if (err) {
                        console.error('Error sending file:', err);
                        res.status(500).json({ error: 'Error sending file', message: err.message });
                    }
                });
            }
        } catch (error) {
            if (error instanceof z.ZodError) {
                res.status(400).json({
                    error: 'Invalid path',
                    details: error.errors
                });
                return;
            }

            console.error('Error processing request:', error);
            res.status(500).json({
                error: 'Failed to process path',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    };
}
