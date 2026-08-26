import { randomUUID } from 'node:crypto';
import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { Client } from 'minio';
import { attachment_type } from '../../../generated/prisma/enums';
import { toAttachmentUrl } from '../../common/utils/attachment-url.util';
import { UploadedAttachmentDto } from './attachments.model';

@Injectable()
export class AttachmentsService {
  private readonly logger = new Logger(AttachmentsService.name);
  private readonly client: Client | null = null;
  private readonly bucket = process.env.S3_BUCKET ?? '';

  constructor() {
    const endPoint = process.env.S3_ENDPOINT;
    const accessKey = process.env.S3_ACCESS_KEY;
    const secretKey = process.env.S3_SECRET_KEY;

    if (!endPoint || !accessKey || !secretKey || !this.bucket) {
      this.logger.warn(
        'S3/MinIO storage is not configured — attachment uploads will fail until it is.',
      );
      return;
    }

    const port = Number(process.env.S3_PORT ?? 443);
    const useSSL = (process.env.S3_USE_SSL ?? 'true') !== 'false';

    this.client = new Client({ endPoint, port, useSSL, accessKey, secretKey });
  }

  async upload(
    buffer: Buffer,
    originalName: string,
    mimeType: string,
  ): Promise<UploadedAttachmentDto> {
    if (!this.client)
      throw new InternalServerErrorException(
        'File storage is not configured!||ការផ្ទុកឯកសារមិនត្រូវបានកំណត់រចនាសម្ព័ន្ធទេ!',
      );

    const extension = originalName.includes('.')
      ? originalName.split('.').pop()
      : undefined;
    const objectName = `chat-attachments/${randomUUID()}${extension ? `.${extension}` : ''}`;

    try {
      await this.client.putObject(
        this.bucket,
        objectName,
        buffer,
        buffer.length,
        {
          'Content-Type': mimeType,
        },
      );
    } catch (error) {
      this.logger.error(
        `Failed to upload ${objectName} to bucket ${this.bucket}: ${
          error instanceof Error ? error.message : error
        }`,
      );
      throw new InternalServerErrorException(
        'Failed to upload file!||បរាជ័យក្នុងការផ្ទុកឡើងឯកសារ!',
      );
    }

    return new UploadedAttachmentDto({
      file_url: toAttachmentUrl(objectName),
      file_type: this.detectType(mimeType),
    });
  }

  private detectType(mimeType: string): attachment_type {
    if (mimeType.startsWith('image/')) return attachment_type.image;
    if (mimeType.startsWith('video/')) return attachment_type.video;
    if (mimeType.startsWith('audio/')) return attachment_type.audio;
    return attachment_type.file;
  }
}
