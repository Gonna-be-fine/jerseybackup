import { IsEmail, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class AdminRechargePointsDto {
  @IsEmail()
  email: string;

  @IsInt()
  @Min(1)
  amount: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  remark?: string;
}
