import { handleRequest } from './server.js';
import { createServer as createHttpServer } from 'node:http';

const port = parseInt(process.env.LATTICE_MCP_REMOTE_PORT || '3100', 10);

const httpServer = createHttpServer(async (req, res) => {
  let body: unknown;
  if (req.method === 'POST') {
    body = await new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      req.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8'))); }
        catch (e) { reject(e); }
      });
      req.on('error', reject);
    });
  }
  await handleRequest(req, res, body);
});

httpServer.listen(port, () => {
  console.log(`Lattice OS Remote MCP listening on :${port}/mcp`);
});
