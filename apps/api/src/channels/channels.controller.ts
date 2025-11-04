import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ChannelsService } from './channels.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('channels')
export class ChannelsController {
  constructor(private svc: ChannelsService) {}

  // === Public channels ===
  @Get()
  list() {
    return this.svc.list();
  }

  @Post()
  create(@Body('name') name: string) {
    return this.svc.create(name);
  }

  // === Unread / Read ===
  @UseGuards(JwtAuthGuard)
  @Post(':id/read')
  async markRead(@Req() req: any, @Param('id') id: string) {
    const meId = req.user.sub;
    return this.svc.markRead(meId, id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('with-unread')
  async listWithUnread(@Req() req: any) {
    const meId = req.user.sub;
    return this.svc.listWithUnread(meId);
  }

  // === Direct messages ===
  @UseGuards(JwtAuthGuard)
  @Get('direct')
  async listMyDirects(@Req() req: any) {
    const meId = req.user.sub;
    return this.svc.listMyDirectChannels(meId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('direct/:userId')
  async getOrCreateDirect(@Req() req: any, @Param('userId') userId: string) {
    const meId = req.user.sub;
    return this.svc.getOrCreateDirectChannel(meId, userId);
  }
}
