import { MonitorService } from "../monitor";
import { BaseContextItem } from "../types/agent";
import {
  Context,
  Conversation,
  MemoryProvider,
  MemoryQueryOptions,
  Message
} from "./types";

/**
 * Service for managing memory operations
 */
export class MemoryService {
  private provider: MemoryProvider;

  constructor(provider: MemoryProvider) {
    if (!provider) {
      throw new Error("Memory provider is required");
    }

    this.provider = provider;
    MonitorService.publishEvent({
      type: "memory.service.initialized",
      message: `Initialized memory service with provider: ${provider.id}`,
      logLevel: "info",
      metadata: { providerId: provider.id }
    });
  }

  /**
   * Generate a deterministic conversation ID based on user and platform
   */
  private generateConversationId(user: string, platform: string): string {
    return `${platform}-${user}`;
  }

  /**
   * Store a user interaction in memory
   */
  async storeUserInteraction(
    user: string,
    platform: string,
    message: string,
    timestamp: number,
    messageId?: string
  ): Promise<void> {
    try {
      MonitorService.publishEvent({
        type: "memory.user.interaction.storing",
        message: "Storing user interaction",
        logLevel: "info",
        metadata: { user, platform, message, messageId }
      });

      const conversationId = await this.getOrCreateConversation(user, platform);

      MonitorService.publishEvent({
        type: "memory.conversation.retrieved",
        message: "Got conversation ID",
        logLevel: "info",
        metadata: { conversationId, user, platform }
      });

      // Use provided messageId or generate one
      const finalMessageId = messageId || `${platform}-${timestamp}`;

      MonitorService.publishEvent({
        type: "memory.message.id.generated",
        message: "Using message ID",
        logLevel: "info",
        metadata: { messageId: finalMessageId, wasProvided: !!messageId }
      });

      // Store the user's message
      await this.storeMessage(
        {
          id: finalMessageId,
          role: "user",
          content: message,
          timestamp
        },
        conversationId
      );

      MonitorService.publishEvent({
        type: "memory.message.stored",
        message: "Stored user message",
        logLevel: "info",
        metadata: { messageId: finalMessageId, conversationId }
      });
    } catch (error) {
      MonitorService.publishEvent({
        type: "memory.user.interaction.failed",
        message: "Failed to store user interaction",
        logLevel: "error",
        metadata: {
          error: error instanceof Error ? error.message : String(error),
          user,
          platform
        }
      });
      throw error;
    }
  }

  /**
   * Store an assistant interaction and its context in memory
   */
  async storeAssistantInteraction(
    user: string,
    platform: string,
    response: string,
    contextChain: BaseContextItem[]
  ): Promise<void> {
    try {
      MonitorService.publishEvent({
        type: "memory.assistant.interaction.storing",
        message: "Storing assistant interaction",
        logLevel: "info",
        metadata: { user, platform, response }
      });

      const conversationId = await this.getOrCreateConversation(user, platform);

      MonitorService.publishEvent({
        type: "memory.conversation.retrieved",
        message: "Got conversation ID",
        logLevel: "info",
        metadata: { conversationId, user, platform }
      });

      const timestamp = Date.now();
      const contextId = `${conversationId}-context-${timestamp}`;
      const messageId = `${conversationId}-assistant-${timestamp}`;

      // Get the user's message ID from the context chain
      const userMessage = contextChain[0];

      MonitorService.publishEvent({
        type: "memory.context.chain.processing",
        message: "Context chain user message",
        logLevel: "info",
        metadata: {
          userMessage,
          contextChain: JSON.stringify(contextChain)
        }
      });

      if (!userMessage?.id) {
        throw new Error("No user message ID found in context chain");
      }

      const userMessageId = userMessage.id;

      MonitorService.publishEvent({
        type: "memory.message.id.extracted",
        message: "Using user message ID from context chain",
        logLevel: "info",
        metadata: { userMessageId }
      });

      // Store the context chain first
      await this.storeContext(
        {
          id: contextId,
          type: "context_chain",
          content: JSON.stringify(contextChain),
          timestamp
        },
        conversationId
      );

      MonitorService.publishEvent({
        type: "memory.context.stored",
        message: "Stored context",
        logLevel: "info",
        metadata: { contextId, conversationId }
      });

      // Then store the assistant's response with reference to the context and user message
      await this.storeMessage(
        {
          id: messageId,
          role: "assistant",
          content: response,
          timestamp,
          contextId: contextId,
          user_message_id: userMessageId
        },
        conversationId
      );

      MonitorService.publishEvent({
        type: "memory.assistant.interaction.completed",
        message: "Successfully stored assistant interaction and context",
        logLevel: "info",
        metadata: { messageId, contextId, conversationId }
      });
    } catch (error) {
      MonitorService.publishEvent({
        type: "memory.assistant.interaction.failed",
        message: "Failed to store assistant interaction",
        logLevel: "error",
        metadata: {
          error: error instanceof Error ? error.message : String(error),
          user,
          platform
        }
      });
      throw error;
    }
  }

  async storeMessage(message: Message, conversationId: string): Promise<void> {
    MonitorService.publishEvent({
      type: "memory.service.store_message.called",
      message: "MemoryService.storeMessage called",
      logLevel: "info",
      metadata: { conversationId, message }
    });
    return this.provider.storeMessage(message, conversationId);
  }

  async storeContext(context: Context, conversationId: string): Promise<void> {
    MonitorService.publishEvent({
      type: "memory.service.store_context.called",
      message: "MemoryService.storeContext called",
      logLevel: "info",
      metadata: { conversationId, context }
    });
    return this.provider.storeContext(context, conversationId);
  }

  async getMessages(options: MemoryQueryOptions): Promise<Message[]> {
    MonitorService.publishEvent({
      type: "memory.service.get_messages.called",
      message: "MemoryService.getMessages called",
      logLevel: "info",
      metadata: { options }
    });
    return this.provider.getMessages(options);
  }

  async getContexts(conversationId: string): Promise<Context[]> {
    MonitorService.publishEvent({
      type: "memory.service.get_contexts.called",
      message: "MemoryService.getContexts called",
      logLevel: "info",
      metadata: { conversationId }
    });
    return this.provider.getContexts(conversationId);
  }

  async getConversation(conversationId: string): Promise<Conversation> {
    MonitorService.publishEvent({
      type: "memory.service.get_conversation.called",
      message: "MemoryService.getConversation called",
      logLevel: "info",
      metadata: { conversationId }
    });
    return this.provider.getConversation(conversationId);
  }

  async createConversation(options?: {
    id?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    metadata?: Record<string, any>;
  }): Promise<string> {
    MonitorService.publishEvent({
      type: "memory.service.create_conversation.called",
      message: "MemoryService.createConversation called",
      logLevel: "info",
      metadata: { options }
    });
    return this.provider.createConversation(options);
  }

  async deleteConversation(conversationId: string): Promise<void> {
    return this.provider.deleteConversation(conversationId);
  }

  /**
   * Get or create a conversation for a user on a platform
   */
  async getOrCreateConversation(
    user: string,
    platform: string
  ): Promise<string> {
    const conversationId = this.generateConversationId(user, platform);
    try {
      await this.getConversation(conversationId);
      return conversationId;
    } catch {
      // Conversation doesn't exist, create it
      await this.createConversation({ id: conversationId });
      return conversationId;
    }
  }

  /**
   * Get recent conversation history for a user/platform
   */
  async getRecentConversationHistory(
    user: string,
    platform: string,
    limit: number = 100
  ): Promise<{ role: string; content: string; timestamp: number }[]> {
    try {
      const conversationId = this.generateConversationId(user, platform);
      const messages = await this.getMessages({
        conversationId,
        limit
      });

      return messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp
      }));
    } catch (error) {
      MonitorService.publishEvent({
        type: "memory.conversation.history.failed",
        message: "Failed to get conversation history",
        logLevel: "error",
        metadata: {
          error: error instanceof Error ? error.message : String(error),
          user,
          platform
        }
      });
      return [];
    }
  }
}
