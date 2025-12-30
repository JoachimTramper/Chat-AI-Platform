// apps/api/src/auth/auth.module.ts
import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import type { StringValue } from 'ms'; //
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { UsersService } from '../users/users.service';
import { MailModule } from '../mail/mail.module';

// Read env safely + type for expiresIn
const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-me';

const EXPIRES_IN: number | StringValue | undefined = (() => {
  const v = process.env.JWT_EXPIRES_IN;
  if (!v) return '15m'; // default
  const n = Number(v);
  return Number.isFinite(n) ? n : (v as StringValue);
})();

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: JWT_SECRET,
      signOptions: { expiresIn: EXPIRES_IN },
    }),
    MailModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, UsersService, JwtStrategy],
  exports: [JwtModule, PassportModule],
})
export class AuthModule {}
