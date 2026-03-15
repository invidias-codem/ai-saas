
import crypto from 'crypto';

const ALGORITHM = 'aes-256-cbc';
const ENCRYPTION_KEY_RAW = process.env.ENCRYPTION_KEY || 'default-dev-key-must-be-32-bytes-long!';
const IV_LENGTH = 16;

// Ensure key is exactly 32 bytes by hashing it
const KEY = crypto.createHash('sha256').update(String(ENCRYPTION_KEY_RAW)).digest(); // SHA256 produces 32 bytes

export function encrypt(text: string): string {
    if (!process.env.ENCRYPTION_KEY) {
        console.warn('WARNING: ENCRYPTION_KEY not set, using insecure default');
    }

    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
}

export function decrypt(text: string): string {
    if (!process.env.ENCRYPTION_KEY) {
        console.warn('WARNING: ENCRYPTION_KEY not set, using insecure default');
    }

    const textParts = text.split(':');
    const ivPart = textParts.shift();
    if (!ivPart) throw new Error('Invalid encrypted text format');

    const iv = Buffer.from(ivPart, 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
}
