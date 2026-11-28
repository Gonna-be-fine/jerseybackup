import { Module } from '@nestjs/common';
import { BoundaryModule } from '../boundary/boundary.module';
import { ResourcesModule } from '../resources/resources.module';
import { ImageGenerationModule } from '../image-generation/image-generation.module';
import { JerseyBoundaryTools } from '../ai/tools/jersey-boundary.tools';
import { JerseyDesignAgent } from './jersey-design-agent.service';
import { ZhipuChatModelProvider } from './providers/zhipu-chat-model.provider';
import { JerseyDesignTools } from './tools/jersey-design.tools';

@Module({
  imports: [BoundaryModule, ResourcesModule, ImageGenerationModule],
  providers: [
    JerseyBoundaryTools,
    JerseyDesignTools,
    ZhipuChatModelProvider,
    JerseyDesignAgent,
  ],
  exports: [JerseyBoundaryTools, JerseyDesignTools, JerseyDesignAgent],
})
export class AgentModule {}
