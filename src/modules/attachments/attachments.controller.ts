import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Express } from 'express';
import { memoryStorage } from 'multer';
import { OauthJwtGuard } from '../../common/guards/oauth-jwt/oauth-jwt.guard';
import { AttachmentsService } from './attachments.service';
import { UploadedAttachmentDto } from './attachments.model';

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25MB

@ApiTags('Mobile - Attachments')
@ApiBearerAuth()
@UseGuards(OauthJwtGuard)
@Controller('v1/attachments')
export class AttachmentsController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

  @Post('upload')
  @ApiOperation({ summary: 'Upload an attachment' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiCreatedResponse({ type: UploadedAttachmentDto })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_FILE_SIZE_BYTES },
    }),
  )
  async upload(
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<UploadedAttachmentDto> {
    if (!file)
      throw new BadRequestException(
        'No file provided!||មិនមានឯកសារផ្ដល់ឲ្យទេ!',
      );

    return this.attachmentsService.upload(
      file.buffer,
      file.originalname,
      file.mimetype,
    );
  }
}
