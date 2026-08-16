import {
  IsArray,
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class AiDesignDto {
  @IsString()
  @MaxLength(1000)
  prompt: string;

  @IsOptional()
  @IsBoolean()
  generateCustomDecal?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  productType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  primaryText?: string;

  @IsOptional()
  @IsArray()
  availableColorParts?: Array<{
    id: string;
    name?: string;
    color?: string;
  }>;

  @IsOptional()
  @IsObject()
  currentColors?: Record<string, string>;

  @IsOptional()
  @IsArray()
  availablePatterns?: Array<{
    id: string;
    name?: string;
    category?: string;
    keywords?: string[];
    url?: string;
  }>;
}
