// apps/api/src/messages/dto/create-message.dto.ts
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateMessageDto {
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  content?: string;

  @IsOptional()
  @IsString()
  replyToMessageId?: string;
}
