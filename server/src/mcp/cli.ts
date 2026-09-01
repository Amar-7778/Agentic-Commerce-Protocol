import { McpServer } from './server.js';
import { seedDatabase } from '../db/seed.js';

async function main() {
  // Ensure DB and seed data are ready
  await seedDatabase();
  const server = McpServer.getInstance();
  server.startStdioTransport();
}

main().catch((err) => {
  console.error('Fatal MCP Server error:', err);
  process.exit(1);
});
