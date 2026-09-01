import readline from 'readline';
import { MCP_TOOLS, executeMcpTool } from './tools.js';
import { McpToolCallRequest, McpToolCallResponse } from './types.js';

export class McpServer {
  private static instance: McpServer;

  public static getInstance(): McpServer {
    if (!McpServer.instance) {
      McpServer.instance = new McpServer();
    }
    return McpServer.instance;
  }

  /**
   * Process a single JSON-RPC 2.0 MCP Message
   */
  public async handleMessage(message: any): Promise<any> {
    const { jsonrpc, id, method, params } = message;

    if (jsonrpc !== '2.0') {
      return {
        jsonrpc: '2.0',
        id: id || null,
        error: { code: -32600, message: 'Invalid Request: jsonrpc must be "2.0"' },
      };
    }

    try {
      switch (method) {
        case 'initialize': {
          return {
            jsonrpc: '2.0',
            id,
            result: {
              protocolVersion: '2024-11-05',
              capabilities: {
                tools: { listChanged: false },
                resources: { subscribe: false, listChanged: false },
                logging: {},
              },
              serverInfo: {
                name: 'universal-commerce-mcp-server',
                version: '1.0.0',
                description: 'Universal Commerce Protocol & Gated Razorpay Test Rails MCP Server',
              },
            },
          };
        }

        case 'ping': {
          return { jsonrpc: '2.0', id, result: {} };
        }

        case 'tools/list': {
          return {
            jsonrpc: '2.0',
            id,
            result: {
              tools: MCP_TOOLS,
            },
          };
        }

        case 'tools/call': {
          const { name, arguments: toolArgs } = params || {};
          if (!name) {
            return {
              jsonrpc: '2.0',
              id,
              error: { code: -32602, message: 'Missing tool "name" in params' },
            };
          }

          try {
            const toolResult = await executeMcpTool(name, toolArgs || {});
            return {
              jsonrpc: '2.0',
              id,
              result: {
                content: [
                  {
                    type: 'text',
                    text: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult, null, 2),
                  },
                ],
                isError: false,
              },
            };
          } catch (toolErr: any) {
            return {
              jsonrpc: '2.0',
              id,
              result: {
                content: [
                  {
                    type: 'text',
                    text: `TOOL_EXECUTION_ERROR: ${toolErr.message}`,
                  },
                ],
                isError: true,
              },
            };
          }
        }

        default:
          return {
            jsonrpc: '2.0',
            id,
            error: { code: -32601, message: `Method "${method}" not found` },
          };
      }
    } catch (err: any) {
      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32603, message: `Internal error: ${err.message}` },
      };
    }
  }

  /**
   * Start Stdio transport loop for Claude Desktop / CLI clients
   */
  public startStdioTransport(): void {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,
    });

    console.error('🚀 [MCP Server] Universal Commerce MCP Server running over stdio transport.');

    rl.on('line', async (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      try {
        const parsed = JSON.parse(trimmed);
        const response = await this.handleMessage(parsed);
        process.stdout.write(JSON.stringify(response) + '\n');
      } catch (err: any) {
        const errResp = {
          jsonrpc: '2.0',
          id: null,
          error: { code: -32700, message: `Parse error: ${err.message}` },
        };
        process.stdout.write(JSON.stringify(errResp) + '\n');
      }
    });
  }
}
