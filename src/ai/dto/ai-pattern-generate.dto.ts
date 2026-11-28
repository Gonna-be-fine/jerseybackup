import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class AiPatternGenerateDto {
  @ApiProperty({
    description: 'A concise visual description of the repeating jersey pattern.',
    example: 'Angular lightning shards and diagonal speed lines, subtle all-over sports texture',
    maxLength: 120,
  })
  @IsString()
  @MaxLength(120)
  brief: string;

  @ApiPropertyOptional({
    description: 'Additional visual direction in Chinese or English.',
    example: '线条由左上向右下倾斜，边缘无缝衔接，纹理不要过密。',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  designIdea?: string;

  @ApiPropertyOptional({ description: 'Garment template product type.', example: 'basketball' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  productType?: string;

  @ApiPropertyOptional({ description: 'Editable foreground color token.', example: '#ffffff' })
  @IsOptional()
  @IsString()
  @Matches(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
  patternColor?: string;
}
