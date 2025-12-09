import { IsEmail, IsString, MinLength } from 'class-validator';

export class EmailRegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsString()
  verificationCode: string;
} 