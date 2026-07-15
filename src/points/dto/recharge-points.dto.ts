import { IsInt, Max, Min } from 'class-validator';

export class RechargePointsDto {
  @IsInt()
  @Min(1)
  @Max(100000)
  amount: number;
}
