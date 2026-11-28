import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PointsModule } from '../points/points.module';
import { ResourcesModule } from '../resources/resources.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AiTask } from './entities/ai-task.entity';
import { AgentModule } from '../agent/agent.module';
import { ImageGenerationModule } from '../image-generation/image-generation.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([AiTask]),
    PointsModule,
    ResourcesModule,
    AgentModule,
    ImageGenerationModule,
  ],
  controllers: [AiController],
  providers: [AiService],
})
export class AiModule {}
