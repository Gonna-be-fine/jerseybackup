import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class AiModelPreviewDto {
  @IsString()
  @MaxLength(500)
  prompt: string;

  @IsOptional()
  @IsObject()
  modelPreset?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  snap2d?: string;

  @IsOptional()
  @IsString()
  snap3d?: string;
}
