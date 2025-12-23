// apps/api/src/messages/dto/create-message.dto.ts
import {
  IsOptional,
  IsString,
  MaxLength,
  IsArray,
  ArrayUnique,
  ValidateNested,
  IsInt,
} from 'class-validator';
import { Type } from 'class-transformer';

class AttachmentDto {
  @IsString()
  url: string;

  @IsString()
  fileName: string;

  @IsString()
  mimeType: string;

  @IsInt()
  size: number;
}

export class CreateMessageDto {
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  content?: string;

  @IsOptional()
  @IsString()
  replyToMessageId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayUnique()
  mentionUserIds?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttachmentDto)
  attachments?: AttachmentDto[];

  @IsOptional()
  @IsString()
  lastReadOverride?: string;
}
