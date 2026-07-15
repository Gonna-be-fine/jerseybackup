import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { PointTransaction } from './entities/point-transaction.entity';
import { RechargeOrder } from './entities/recharge-order.entity';
import { PointsController } from './points.controller';
import { PointsService } from './points.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, PointTransaction, RechargeOrder])],
  controllers: [PointsController],
  providers: [PointsService],
  exports: [PointsService],
})
export class PointsModule {}
