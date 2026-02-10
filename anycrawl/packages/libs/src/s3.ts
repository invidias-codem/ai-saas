import { Readable } from "stream";
import { S3Client, PutObjectCommand, GetObjectCommand, PutObjectCommandOutput } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { log } from "./log.js";

interface IStorage {
    upload(key: string, body: Readable | Buffer | string): Promise<PutObjectCommandOutput | void>;
    getTemporaryUrl(key: string, expiresIn?: number): Promise<string>;
    uploadImage(key: string, imageData: Buffer | Readable, contentType?: string): Promise<PutObjectCommandOutput | void>;
}

class S3Storage implements IStorage {
    private client: S3Client;
    private bucket: string;

    constructor() {
        if (!process.env.ANYCRAWL_S3_ENDPOINT) {
            throw new Error("ANYCRAWL_S3_ENDPOINT is required");
        }
        if (!process.env.ANYCRAWL_S3_ACCESS_KEY || !process.env.ANYCRAWL_S3_SECRET_ACCESS_KEY) {
            throw new Error("ANYCRAWL_S3_ACCESS_KEY is required");
        }
        if (!process.env.ANYCRAWL_S3_BUCKET) {
            throw new Error("ANYCRAWL_S3_BUCKET is required");
        }

        this.client = new S3Client({
            region: process.env.ANYCRAWL_S3_REGION,
            endpoint: process.env.ANYCRAWL_S3_ENDPOINT,
            credentials: {
                accessKeyId: process.env.ANYCRAWL_S3_ACCESS_KEY,
                secretAccessKey: process.env.ANYCRAWL_S3_SECRET_ACCESS_KEY,
            },
        });
        this.bucket = process.env.ANYCRAWL_S3_BUCKET;
    }

    async upload(key: string, body: Readable | Buffer | string) {
        const command = new PutObjectCommand({
            Bucket: this.bucket,
            Key: key,
            Body: body,
        });
        log.info(`Uploading to S3: ${key}`);
        const result = await this.client.send(command);
        log.info(`Uploaded to S3: ${key} result: ${JSON.stringify(result)}`);
        return result;
    }

    async getTemporaryUrl(key: string, expiresIn: number = 3600): Promise<string> {
        const command = new GetObjectCommand({
            Bucket: this.bucket,
            Key: key,
        });

        return getSignedUrl(this.client, command, { expiresIn });
    }

    async uploadImage(key: string, imageData: Buffer | Readable, contentType: string = 'image/jpeg') {
        const command = new PutObjectCommand({
            Bucket: this.bucket,
            Key: key,
            Body: imageData,
            ContentType: contentType,
        });

        log.info(`Uploading image to S3: ${key}`);
        const result = await this.client.send(command);
        log.info(`Uploaded image to S3: ${key}`);
        return result;
    }
}

class NoOpStorage implements IStorage {
    async upload(key: string, _body: Readable | Buffer | string): Promise<void> {
        log.info(`[NoOpStorage] Skipping upload for key: ${key}`);
        return Promise.resolve();
    }

    async getTemporaryUrl(key: string, _expiresIn?: number): Promise<string> {
        log.info(`[NoOpStorage] Skipping getTemporaryUrl for key: ${key}`);
        return Promise.resolve("");
    }

    async uploadImage(key: string, _imageData: Buffer | Readable, _contentType?: string): Promise<void> {
        log.info(`[NoOpStorage] Skipping uploadImage for key: ${key}`);
        return Promise.resolve();
    }
}

function createS3Client(): IStorage {
    if (process.env.ANYCRAWL_STORAGE === "s3") {
        log.info("Using S3 storage");
        return new S3Storage();
    }
    log.info("Using NoOp storage");
    return new NoOpStorage();
}

export const s3: IStorage = createS3Client();
