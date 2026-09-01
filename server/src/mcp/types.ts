/**
 * Model Context Protocol (MCP) JSON-RPC 2.0 Types & Contracts
 */

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface McpToolCallRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: 'tools/call';
  params: {
    name: string;
    arguments?: Record<string, any>;
  };
}

export interface McpToolCallResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: {
    content: Array<{
      type: 'text' | 'image' | 'resource';
      text?: string;
      data?: any;
    }>;
    isError?: boolean;
  };
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export interface AuditEntry {
  action_id?: string;
  timestamp?: string;
  actor: 'ai_buyer_agent' | 'user' | 'merchant_system' | 'governance_gateway';
  actor_id?: string;
  action_type: string;
  amount?: number;
  target: string;
  reasoning: string;
  authorization_ref?: string;
  status: 'success' | 'failed' | 'blocked';
  gate_checks_passed?: string[];
  payload?: Record<string, any>;
}
