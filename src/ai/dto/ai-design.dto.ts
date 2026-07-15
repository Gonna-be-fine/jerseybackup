import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class AiDesignDto {
  @IsString()
  @MaxLength(1000)
  prompt: string;

  @IsOptional()
  @IsBoolean()
  generateCustomDecal?: boolean;
}
