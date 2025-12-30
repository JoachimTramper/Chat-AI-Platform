import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { ChannelsService } from './channels.service';
import { UsersService } from '../users/users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { User } from '../auth/decorators/user.decorator';

@Controller('channels')
export class ChannelsController {
  constructor(
    private svc: ChannelsService,
    private users: UsersService,
  ) {}

  // === My channels ===
  @UseGuards(JwtAuthGuard)
  @Get()
  list(@User() user: any) {
    return this.svc.list(user.sub);
  }

  // === Create channel (admin only) ===
  @UseGuards(JwtAuthGuard)
  @Post()
  async create(@User() user: any, @Body('name') name: string) {
    const isAdmin = await this.users.isAdmin(user.sub);
    if (!isAdmin) {
      throw new ForbiddenException('Admins only');
    }
    return this.svc.create(name);
  }

  // === Unread / Read ===
  @UseGuards(JwtAuthGuard)
  @Post(':id/read')
  markRead(@User() user: any, @Param('id') id: string) {
    return this.svc.markRead(user.sub, id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('with-unread')
  listWithUnread(@User() user: any) {
    return this.svc.listWithUnread(user.sub);
  }

  // === Direct messages ===
  @UseGuards(JwtAuthGuard)
  @Get('direct')
  listMyDirects(@User() user: any) {
    return this.svc.listMyDirectChannels(user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Get('direct/:userId')
  getOrCreateDirect(@User() user: any, @Param('userId') userId: string) {
    return this.svc.getOrCreateDirectChannel(user.sub, userId);
  }
}
