import * as nodeCrypto from 'crypto';
if (!(globalThis as any).crypto) {
  (globalThis as any).crypto = nodeCrypto;
}

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

import { NestExpressApplication } from '@nestjs/platform-express';
import { UPLOADS_DIR } from './uploads/uploads.constants';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
  );

  app.enableCors({
    origin: ['https://bamboo-comms.vercel.app', 'http://localhost:3001'],
    credentials: true,
  });

  app.useStaticAssets(UPLOADS_DIR, {
    prefix: '/uploads',
  });

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port, '0.0.0.0');
}
bootstrap();
