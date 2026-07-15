import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class AiLogoDto {
  @IsString()
  @MaxLength(500)
  prompt: string;

  @IsOptional()
  @IsString()
  style?: string;

  @IsOptional()
  @IsBoolean()
  inheritColors?: boolean;

  @IsOptional()
  @IsString()
  baseColor?: string;

  @IsOptional()
  @IsString()
  accentColor?: string;

  @IsOptional()
  @IsIn(['png', 'svg'])
  outputFormat?: 'png' | 'svg';
}
