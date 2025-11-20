// apps/api/src/messages/messages.controller.ts
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Patch,
  Delete,
  Query,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import { MessagesService } from './messages.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { User } from '../auth/decorators/user.decorator';
import { CreateMessageDto } from './dto/create-message.dto';
import { UpdateMessageDto } from './dto/update-message.dto';

@Controller('channels/:id/messages')
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(private readonly svc: MessagesService) {}

  @Get()
  list(
    @Param('id') channelId: string,
    @Query('take') take?: string,
    @Query('cursor') cursor?: string,
  ) {
    const n = take ? Number(take) : 50;
    return this.svc.list(channelId, Number.isFinite(n) ? n : 50, cursor);
  }

  @Post()
  create(
    @Param('id') channelId: string,
    @Body() dto: CreateMessageDto, // { content?: string }
    @User() user: { sub: string; email: string }, // from JWT
  ) {
    return this.svc.create(
      channelId,
      user.sub,
      dto.content,
      dto.replyToMessageId,
    );
  }

  // EDIT message
  @Patch(':messageId')
  update(
    @Param('id') _channelId: string,
    @Param('messageId') messageId: string,
    @Body() dto: UpdateMessageDto, // { content?: string }
    @User() user: { sub: string; email: string },
  ) {
    return this.svc.update(messageId, user.sub, dto.content ?? '');
  }

  // SOFT-DELETE message
  @Delete(':messageId')
  @HttpCode(204)
  async remove(
    @Param('id') _channelId: string, // optional
    @Param('messageId') messageId: string,
    @User() user: { sub: string; email: string },
  ) {
    await this.svc.softDelete(messageId, user.sub);
    // 204 No Content
  }

  // REACT emoji
  @Post(':messageId/reactions')
  async react(
    @Param('id') _channelId: string,
    @Param('messageId') messageId: string,
    @Body('emoji') emoji: string,
    @User() user: { sub: string },
  ) {
    await this.svc.addReaction(messageId, user.sub, emoji);
    return { ok: true };
  }

  // UNREACT
  @Delete(':messageId/reactions')
  @HttpCode(204)
  async unreact(
    @Param('id') _channelId: string,
    @Param('messageId') messageId: string,
    @Body('emoji') emoji: string,
    @User() user: { sub: string },
  ) {
    await this.svc.removeReaction(messageId, user.sub, emoji);
    // 204 No Content
  }
}
