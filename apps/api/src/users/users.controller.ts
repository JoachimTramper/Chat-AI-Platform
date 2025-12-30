import {
  Controller,
  Delete,
  Param,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { User } from '../auth/decorators/user.decorator';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async delete(@User() user: any, @Param('id') id: string) {
    const isAdmin = await this.users.isAdmin(user.sub);
    if (!isAdmin) {
      throw new ForbiddenException('Admins only');
    }

    return this.users.deleteUser(id);
  }
}
