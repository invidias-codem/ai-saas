
import { encrypt, decrypt } from '../lib/encryption';
import assert from 'assert';

console.log('Verifying Encryption...');

const original = 'super-secret-token-123';
const encrypted = encrypt(original);
console.log('Encrypted:', encrypted);

const decrypted = decrypt(encrypted);
console.log('Decrypted:', decrypted);

assert.strictEqual(original, decrypted, 'Decrypted value should match original');
console.log('SUCCESS: Encryption verification passed.');
