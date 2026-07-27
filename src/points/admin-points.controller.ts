import {
  Body,
  Controller,
  Headers,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdminRechargePointsDto } from './dto/admin-recharge-points.dto';
import { PointsService } from './points.service';

@Controller('points/admin')
export class AdminPointsController {
  constructor(
    private readonly configService: ConfigService,
    private readonly pointsService: PointsService,
  ) {}

  @Post('recharge-by-email')
  rechargeByEmail(
    @Headers('x-admin-api-key') adminApiKey: string,
    @Body() dto: AdminRechargePointsDto,
  ) {
    const expectedApiKey = this.configService.get<string>('ADMIN_API_KEY');

    if (!expectedApiKey || adminApiKey !== expectedApiKey) {
      throw new UnauthorizedException('Invalid admin api key');
    }

    return this.pointsService.addPointsByEmail(
      dto.email,
      dto.amount,
      dto.remark || 'Admin manual recharge',
    );
  }
}
