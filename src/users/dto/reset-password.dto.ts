import { IsEmail, IsInt, IsString, Max, Min, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsInt()
  @Min(1)
  @Max(9)
  captchaLeft: number;

  @IsInt()
  @Min(1)
  @Max(9)
  captchaRight: number;

  @IsInt()
  captchaAnswer: number;
}
