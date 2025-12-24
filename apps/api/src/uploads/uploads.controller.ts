// apps/api/src/uploads/uploads.controller.ts
import {
  BadRequestException,
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { UPLOADS_DIR } from './uploads.constants';
import { UploadsService } from './uploads.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Throttle } from '@nestjs/throttler';

const MAX_BYTES = 10 * 1024 * 1024; // 10MB

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
]);

@Controller('uploads')
@UseGuards(JwtAuthGuard)
export class UploadsController {
  constructor(private uploads: UploadsService) {}

  @Throttle({ default: { limit: 10, ttl: 60 } })
  @Post('message')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_BYTES },
      fileFilter: (req, file, cb) => {
        if (!ALLOWED_MIME.has(file.mimetype)) {
          return cb(new BadRequestException('File type not allowed'), false);
        }
        cb(null, true);
      },
      storage: diskStorage({
        destination: UPLOADS_DIR,
        filename: (req, file, cb) => {
          const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);

          // keep ONLY extension; prevents weird names
          const ext = extname(file.originalname).toLowerCase();
          cb(null, `${unique}${ext}`);
        },
      }),
    }),
  )
  uploadMessageFile(@UploadedFile() file: Express.Multer.File) {
    return this.uploads.saveFile(file);
  }
}
