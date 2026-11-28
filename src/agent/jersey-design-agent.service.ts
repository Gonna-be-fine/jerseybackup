import { Injectable, Logger } from '@nestjs/common';
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from '@langchain/core/messages';
import {
  END,
  MemorySaver,
  MessagesAnnotation,
  START,
  StateGraph,
} from '@langchain/langgraph';
import { JerseyBoundaryTools } from '../ai/tools/jersey-boundary.tools';
import { JerseyDesignTools, GeneratedDesignAsset } from './tools/jersey-design.tools';
import { ZhipuChatModelProvider } from './providers/zhipu-chat-model.provider';

export interface JerseyDesignAgentResult {
  text: string;
  toolResults: Array<{ name?: string; content: string }>;
  generatedAssets: GeneratedDesignAsset[];
}

@Injectable()
export class JerseyDesignAgent {
  private readonly logger = new Logger(JerseyDesignAgent.name);
  private graph: any;

  constructor(
    private readonly modelProvider: ZhipuChatModelProvider,
    private readonly boundaryTools: JerseyBoundaryTools,
    private readonly designTools: JerseyDesignTools,
  ) {}

  private getGraph() {
    if (this.graph) {
      return this.graph;
    }

    const tools = [
      ...this.boundaryTools.getLangChainTools(),
      ...this.designTools.getLangChainTools(),
    ];
    const toolsByName = new Map<string, any>(
      tools.map((item) => [item.name, item] as [string, any]),
    );
    const modelWithTools = this.modelProvider.createChatModel().bindTools(tools);

    const callModel = async (state: typeof MessagesAnnotation.State) => {
      const response = await modelWithTools.invoke(state.messages);
      return { messages: [response] };
    };

    const executeTools = async (state: typeof MessagesAnnotation.State) => {
      const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
      const calls = lastMessage.tool_calls || [];

      const results = await Promise.all(
        calls.map(async (call, index) => {
          const selectedTool = toolsByName.get(call.name);
          if (!selectedTool) {
            return new ToolMessage({
              content: `Tool "${call.name}" is not registered.`,
              tool_call_id: call.id || `${call.name}-${index}`,
              name: call.name,
              status: 'error',
            });
          }

          try {
            const result = await selectedTool.invoke(call.args);
            return new ToolMessage({
              content:
                typeof result === 'string' ? result : JSON.stringify(result),
              tool_call_id: call.id || `${call.name}-${index}`,
              name: call.name,
            });
          } catch (error) {
            const message =
              error instanceof Error ? error.message : String(error);
            this.logger.warn(`Tool ${call.name} failed: ${message}`);
            return new ToolMessage({
              content: `Tool execution failed: ${message}`,
              tool_call_id: call.id || `${call.name}-${index}`,
              name: call.name,
              status: 'error',
            });
          }
        }),
      );

      return { messages: results };
    };

    const routeAfterModel = (state: typeof MessagesAnnotation.State) => {
      const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
      return lastMessage.tool_calls?.length ? 'tools' : END;
    };

    const workflow = new StateGraph(MessagesAnnotation)
      .addNode('agent', callModel)
      .addNode('tools', executeTools)
      .addEdge(START, 'agent')
      .addConditionalEdges('agent', routeAfterModel)
      .addEdge('tools', 'agent');

    this.graph = workflow.compile({
      // In-memory checkpointing is suitable for local development.
      // Replace with a durable Postgres checkpointer before multi-instance production.
      checkpointer: new MemorySaver(),
    });

    return this.graph;
  }

  async getTemplateRegionIds(productType: string): Promise<string[]> {
    const boundary = await this.boundaryTools.getJerseyBoundary({ productType });
    return boundary.colorRegions.map((region) => region.id);
  }

  async generateDesign(
    systemPrompt: string,
    userPrompt: string,
    threadId: string,
  ): Promise<JerseyDesignAgentResult> {
    const result = await this.getGraph().invoke(
      {
        messages: [
          new SystemMessage(systemPrompt),
          new HumanMessage(userPrompt),
        ],
      },
      {
        configurable: { thread_id: threadId },
        recursionLimit: 24,
      },
    );

    const lastMessage = result.messages[result.messages.length - 1];
    if (!lastMessage || !(lastMessage instanceof AIMessage)) {
      throw new Error('Design agent did not return a final AI message.');
    }

    const content = lastMessage.content;
    const text =
      typeof content === 'string'
        ? content.trim()
        : content
            .filter((part) => typeof part === 'object' && part !== null && 'text' in part)
            .map((part: any) => part.text)
            .join('')
            .trim();

    if (!text) {
      throw new Error('Design agent returned an empty response.');
    }

    const toolResults = result.messages
      .filter((message) => message instanceof ToolMessage)
      .map((message: ToolMessage) => ({
        name: message.name,
        content:
          typeof message.content === 'string'
            ? message.content
            : JSON.stringify(message.content),
      }));

    // Binary image payloads never enter the LLM conversation. Tools return a
    // compact asset ID, and the backend attaches the image after the graph ends.
    const generatedAssets: GeneratedDesignAsset[] = [];
    for (const toolResult of toolResults) {
      if (toolResult.name !== 'generate_jersey_badge') continue;
      try {
        const parsed = JSON.parse(toolResult.content);
        if (typeof parsed.assetId === 'string') {
          const asset = this.designTools.consumeGeneratedAsset(parsed.assetId);
          if (asset) generatedAssets.push(asset);
        }
      } catch (error) {
        this.logger.warn('Could not resolve generated badge asset from tool result.');
      }
    }

    return { text, toolResults, generatedAssets };
  }
}
