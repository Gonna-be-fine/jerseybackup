import { IsIn } from 'class-validator';

export class CreateRechargeOrderDto {
  @IsIn(['starter', 'standard', 'pro', 'team'])
  packageId: string;
}
