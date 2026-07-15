import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateRechargeOrderDto } from './dto/create-recharge-order.dto';
import { RechargePointsDto } from './dto/recharge-points.dto';
import { PointsService } from './points.service';

@UseGuards(JwtAuthGuard)
@Controller('points')
export class PointsController {
  constructor(private readonly pointsService: PointsService) {}

  @Get('balance')
  getBalance(@Request() req) {
    return this.pointsService.getBalance(req.user.id);
  }

  @Get('transactions')
  listTransactions(@Request() req, @Query('limit') limit?: number) {
    return this.pointsService.listTransactions(req.user.id, limit);
  }

  @Get('recharge/packages')
  getRechargePackages() {
    return this.pointsService.getRechargePackages();
  }

  @Post('recharge/orders')
  createRechargeOrder(@Request() req, @Body() dto: CreateRechargeOrderDto) {
    return this.pointsService.createRechargeOrder(req.user.id, dto.packageId);
  }

  @Get('recharge/orders/:orderNo')
  getRechargeOrder(@Request() req, @Param('orderNo') orderNo: string) {
    return this.pointsService.getRechargeOrder(req.user.id, orderNo);
  }

  @Post('recharge/orders/:orderNo/simulate-pay')
  simulatePayRechargeOrder(@Request() req, @Param('orderNo') orderNo: string) {
    return this.pointsService.simulatePayRechargeOrder(req.user.id, orderNo);
  }

  @Post('recharge/mock')
  mockRecharge(@Request() req, @Body() dto: RechargePointsDto) {
    return this.pointsService.addPoints(req.user.id, dto.amount, 'Development mock recharge');
  }
}
