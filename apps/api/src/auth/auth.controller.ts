import {
  Body,
  Controller,
  Get,
  Post,
  Patch,
  UseGuards,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { AuthGuard } from '@nestjs/passport';
import { User } from './decorators/user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';

import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';

const AVATAR_DEST = './uploads/avatars';

@Controller('auth')
export class AuthController {
  constructor(
    private auth: AuthService,
    private prisma: PrismaService,
    private usersService: UsersService,
  ) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto.email, dto.password, dto.displayName);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  @Post('refresh')
  refresh(@Body('refreshToken') token: string) {
    return this.auth.refresh(token);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('me')
  async me(@User() user: any) {
    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.sub },
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarUrl: true,
      },
    });

    return {
      sub: dbUser?.id,
      email: dbUser?.email,
      displayName: dbUser?.displayName,
      avatarUrl: dbUser?.avatarUrl,
    };
  }

  @UseGuards(AuthGuard('jwt'))
  @Patch('me/avatar')
  async clearMyAvatar(@User() user: any) {
    const updated = await this.usersService.updateAvatar(user.sub, null);

    return {
      sub: updated.id,
      email: updated.email,
      displayName: updated.displayName,
      avatarUrl: updated.avatarUrl,
    };
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('me/avatar/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: AVATAR_DEST,
        filename: (req: any, file, cb) => {
          const ext = extname(file.originalname) || '.png';
          const name = `${req.user.sub}-${Date.now()}${ext}`;
          cb(null, name);
        },
      }),
      limits: {
        fileSize: 2 * 1024 * 1024, // 2MB
      },
    }),
  )
  async uploadMyAvatar(
    @User() user: any,
    @UploadedFile() file: Express.Multer.File,
  ) {
    // frontend gets avatar here
    const avatarUrl = `/uploads/avatars/${file.filename}`;

    const updated = await this.usersService.updateAvatar(user.sub, avatarUrl);

    return {
      sub: updated.id,
      email: updated.email,
      displayName: updated.displayName,
      avatarUrl: updated.avatarUrl,
    };
  }
}
