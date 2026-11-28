import { Module } from '@nestjs/common';
import { BoundaryModule } from '../boundary/boundary.module';
import { JerseyBoundaryTools } from '../ai/tools/jersey-boundary.tools';
import { JerseyDesignAgent } from './jersey-design-agent.service';
import { ZhipuChatModelProvider } from './providers/zhipu-chat-model.provider';

@Module({
  imports: [BoundaryModule],
  providers: [
    JerseyBoundaryTools,
    ZhipuChatModelProvider,
    JerseyDesignAgent,
  ],
  exports: [JerseyBoundaryTools, JerseyDesignAgent],
})
export class AgentModule {}
