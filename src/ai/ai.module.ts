import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BoundaryModule } from '../boundary/boundary.module';
import { PointsModule } from '../points/points.module';
import { ResourcesModule } from '../resources/resources.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { JerseyBoundaryTools } from './tools/jersey-boundary.tools';
import { AiTask } from './entities/ai-task.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([AiTask]),
    PointsModule,
    ResourcesModule,
    BoundaryModule,
  ],
  controllers: [AiController],
  providers: [AiService, JerseyBoundaryTools],
  exports: [JerseyBoundaryTools],
})
export class AiModule {}
