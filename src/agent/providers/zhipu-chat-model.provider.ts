import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ChatOpenAI } from '@langchain/openai';

/**
 * Zhipu's OpenAI-compatible Chat Completions endpoint.
 *
 * We intentionally use ChatOpenAI instead of the old ChatZhipuAI community
 * integration: the latter is in the sunset package and does not expose the
 * tool-calling capability required by this agent.
 */
@Injectable()
export class ZhipuChatModelProvider {
  createChatModel() {
    const apiKey = process.env.ZHIPUAI_API_KEY?.trim();
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'ZHIPUAI_API_KEY is not configured.',
      );
    }

    const model = process.env.ZHIPU_MODEL?.trim();
    if (!model) {
      throw new ServiceUnavailableException(
        'ZHIPU_MODEL is not configured. Set it to a model enabled for your Zhipu account.',
      );
    }

    return new ChatOpenAI({
      model,
      apiKey,
      temperature: 0.25,
      configuration: {
        baseURL:
          process.env.ZHIPU_BASE_URL?.trim() ||
          'https://open.bigmodel.cn/api/paas/v4',
      },
    });
  }
}
