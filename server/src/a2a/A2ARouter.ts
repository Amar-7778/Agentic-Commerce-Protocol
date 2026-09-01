import { A2AMessage, AgentRole } from './types.js';
import { AuditLogRepository } from '../db/repositories/AuditLogRepository.js';

export class A2ARouter {
  private static instance: A2ARouter;
  private messageHistory: Map<string, A2AMessage[]> = new Map();
  private auditRepo: AuditLogRepository;

  private constructor() {
    this.auditRepo = AuditLogRepository.getInstance();
  }

  public static getInstance(): A2ARouter {
    if (!A2ARouter.instance) {
      A2ARouter.instance = new A2ARouter();
    }
    return A2ARouter.instance;
  }

  /**
   * Dispatch an A2A message between agents and record trace
   */
  public async dispatch<T>(message: A2AMessage<T>): Promise<A2AMessage<T>> {
    const convId = message.conversation_id || 'default_conversation';
    if (!this.messageHistory.has(convId)) {
      this.messageHistory.set(convId, []);
    }
    this.messageHistory.get(convId)!.push(message);

    // Audit log inter-agent communication
    await this.auditRepo.record({
      entity_type: 'a2a_message',
      entity_id: message.id,
      action: `a2a_${message.message_type}`,
      actor_type: message.from_agent as any,
      actor_id: message.from_agent,
      reasoning: `A2A Handoff [${message.from_agent} -> ${message.to_agent}]: ${message.message_type}`,
      payload: {
        conversation_id: convId,
        message_type: message.message_type,
        payload_keys: Object.keys(message.payload || {}),
      },
    });

    return message;
  }

  public getConversationTrace(conversationId: string): A2AMessage[] {
    return this.messageHistory.get(conversationId) || [];
  }

  public clearTrace(conversationId: string): void {
    this.messageHistory.delete(conversationId);
  }
}
