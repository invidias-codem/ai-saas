import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });
dotenv.config({ path: resolve(process.cwd(), '.env') });

import { createDocument } from '../lib/documents/store';
import { StorageState, EmbeddingTier } from '../lib/types/documents';

async function main() {
  try {
    const doc = await createDocument({
      workspace_id: 'test-workspace',
      user_id: 'test-user',
      filename: 'test.txt',
      mime_type: 'text/plain',
      storage_uri: 'gs://test/test.txt',
      storage_state: StorageState.WARM,
      content_raw: 'test',
      embedding_tier: EmbeddingTier.STANDARD_768,
      parent_id: undefined,
      version: 1
    });
    console.log('Insert success:', doc);
  } catch (err) {
    console.error('Insert error:', err);
  }
}
main();
