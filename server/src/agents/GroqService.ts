import { Groq } from 'groq-sdk';
import { UNIVERSAL_COMMERCE_SYSTEM_PROMPT } from './index.js';
import { executeMcpTool, MCP_TOOLS } from '../mcp/tools.js';
import { config } from '../config/index.js';

export interface GroqChatResult {
  naturalLanguageResponse: string;
  items: any[];
  upsellBundle: any[];
  targetPlatform: string | null;
  /** Tool calls the model actually made, in order — surfaced in the UI trace. */
  toolTrace: Array<{ tool: string; args: Record<string, any>; ok: boolean; error?: string }>;
  model: string;
  turnsUsed: number;
}

/**
 * Thin wrapper over Groq's OpenAI-compatible chat completions, wired to the MCP
 * tool registry so the model plans over the same tools the rest of the system
 * exposes. Every parameter comes from `config.llm`.
 */
export class GroqService {
  private static instance: GroqService;
  private groq: Groq | null = null;
  private readonly model: string = config.llm.model;

  private constructor() {
    if (config.llm.apiKey) {
      this.groq = new Groq({ apiKey: config.llm.apiKey, timeout: config.llm.timeoutMs });
      console.log(`⚡ [Groq] Conversational engine ready — model ${this.model}`);
    }
  }

  public static getInstance(): GroqService {
    if (!GroqService.instance) {
      GroqService.instance = new GroqService();
    }
    return GroqService.instance;
  }

  public isAvailable(): boolean {
    return this.groq !== null;
  }

  public getModel(): string {
    return this.model;
  }

  /**
   * Multi-turn conversation with MCP tool calling.
   *
   * Throws when the model or transport fails so the caller can decide what to
   * do — the deterministic catalog engine handles it rather than the error being
   * swallowed and silently reported as an LLM answer.
   */
  public async chatWithTools(
    userPrompt: string,
    userId: string = config.commerce.demoUserId,
    sessionContext?: {
      activeItem?: any;
      quantity?: number;
      pastOrders?: any[];
      recentHistory?: Array<{ role: 'user' | 'assistant'; text: string }>;
    }
  ): Promise<GroqChatResult> {
    if (!this.groq) {
      throw new Error('GROQ_API_KEY is not configured — the conversational LLM path is unavailable.');
    }

    // MCP tool schemas map directly onto the OpenAI function-calling shape.
    const groqTools = MCP_TOOLS.map((t) => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.inputSchema,
      },
    }));

    const contextLines: string[] = [`[Acting for]: ${userId}`];
    if (sessionContext?.activeItem) {
      const item = sessionContext.activeItem;
      contextLines.push(
        `[Active item]: "${item.title}" (id ${item.id}, ${item.currency || config.commerce.defaultCurrency} ${item.price}, qty ${sessionContext.quantity || 1})`
      );
    }
    if (sessionContext?.pastOrders?.length) {
      contextLines.push(`[Recent orders]: ${sessionContext.pastOrders.map((o) => o.title).join(', ')}`);
    }

    const messages: any[] = [
      {
        role: 'system',
        content: `${UNIVERSAL_COMMERCE_SYSTEM_PROMPT}\n\n${contextLines.join('\n')}`,
      },
    ];

    if (sessionContext?.recentHistory?.length) {
      for (const h of sessionContext.recentHistory.slice(-config.llm.historyWindow)) {
        messages.push({ role: h.role, content: h.text });
      }
    }

    messages.push({ role: 'user', content: userPrompt });

    const collectedItems: any[] = [];
    const collectedUpsell: any[] = [];
    const toolTrace: GroqChatResult['toolTrace'] = [];
    let detectedPlatform: string | null = null;
    let turnsUsed = 0;

    for (let turn = 0; turn < config.llm.maxToolTurns; turn++) {
      turnsUsed = turn + 1;

      const completion = await this.groq.chat.completions.create({
        model: this.model,
        messages,
        tools: groqTools,
        tool_choice: 'auto',
        temperature: config.llm.temperature,
        max_tokens: config.llm.maxTokens,
      });

      const responseMessage = completion.choices[0]?.message;
      if (!responseMessage) {
        throw new Error(`Model ${this.model} returned no choices.`);
      }

      // Echo the assistant turn back verbatim minus provider-specific fields.
      // The gpt-oss family adds a `reasoning` field that is not valid on the
      // way back in, so it is stripped rather than replayed.
      const { reasoning, ...replayable } = responseMessage as Record<string, any>;
      messages.push(replayable);

      const toolCalls = responseMessage.tool_calls || [];
      if (toolCalls.length === 0) {
        const text = (responseMessage.content || '').replace(/\*\*/g, '').trim();
        if (!text) {
          throw new Error(`Model ${this.model} returned an empty response.`);
        }
        return {
          naturalLanguageResponse: text,
          items: collectedItems,
          upsellBundle: collectedUpsell,
          targetPlatform: detectedPlatform,
          toolTrace,
          model: this.model,
          turnsUsed,
        };
      }

      for (const toolCall of toolCalls) {
        const toolName = toolCall.function.name;
        let toolArgs: Record<string, any> = {};
        try {
          toolArgs = JSON.parse(toolCall.function.arguments || '{}');
        } catch {
          toolArgs = {};
        }

        // Default the acting identity so the model can't shop as someone else.
        if ('user_id' in toolArgs === false && /user_id/.test(JSON.stringify(toolCall.function))) {
          toolArgs.user_id = userId;
        }
        if (toolArgs.platform_id) {
          detectedPlatform = toolArgs.platform_id;
        }

        let toolResult: any;
        try {
          toolResult = await executeMcpTool(toolName, toolArgs);
          toolTrace.push({ tool: toolName, args: toolArgs, ok: true });

          if (Array.isArray(toolResult?.items)) {
            if (toolName === 'get_upsell_bundle') {
              collectedUpsell.push(...toolResult.items);
            } else if (toolName === 'search_catalog' || toolName === 'get_recommendations' || toolName === 'get_reorder_suggestions') {
              collectedItems.push(...toolResult.items);
            }
          }
        } catch (err: any) {
          // Tool errors are data the model can react to, not a hard stop.
          toolResult = { error: err?.message || String(err) };
          toolTrace.push({ tool: toolName, args: toolArgs, ok: false, error: toolResult.error });
        }

        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(toolResult),
        });
      }
    }

    // Turn budget exhausted while the model was still calling tools. Return what
    // was gathered and say plainly that the loop was cut short.
    return {
      naturalLanguageResponse:
        `I gathered results across ${toolTrace.length} tool call${toolTrace.length === 1 ? '' : 's'} but ran out of ` +
        `reasoning turns before writing a summary. The matched items are below.`,
      items: collectedItems,
      upsellBundle: collectedUpsell,
      targetPlatform: detectedPlatform,
      toolTrace,
      model: this.model,
      turnsUsed,
    };
  }
}
