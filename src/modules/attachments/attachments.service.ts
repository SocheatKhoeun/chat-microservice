import { randomUUID } from 'node:crypto';
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { Client as MinioClient } from 'minio';
import { attachment_type } from '../../../generated/prisma/enums';
import { SettingService } from '../../core/services/setting/setting.service';
import { UploadedAttachmentDto } from './attachments.model';

@Injectable()
export class AttachmentsService {
  private s3Client!: MinioClient;
  private bucketName!: string;
  private initialized = false;

  constructor(private readonly settingService: SettingService) {}

  private async initS3() {
    if (this.initialized) return;

    const settings = await this.settingService.getS3Settings();

    if (
      !settings.s3Endpoint ||
      !settings.s3AccessKey ||
      !settings.s3SecretKey ||
      !settings.s3BucketName
    ) {
      throw new InternalServerErrorException(
        'File storage is not configured!||ការផ្ទុកឯកសារមិនត្រូវបានកំណត់រចនាសម្ព័ន្ធទេ!',
      );
    }

    this.bucketName = settings.s3BucketName;

    const endpointForClient = settings.s3Endpoint.replace(/^https?:\/\//, '');
    this.s3Client = new MinioClient({
      endPoint: endpointForClient,
      port: settings.s3Port,
      useSSL: settings.s3UseSsl,
      accessKey: settings.s3AccessKey,
      secretKey: settings.s3SecretKey,
    });
    this.initialized = true;
  }

  async upload(
    buffer: Buffer,
    originalName: string,
    mimeType: string,
  ): Promise<UploadedAttachmentDto> {
    await this.initS3();

    try {
      const exists = await this.s3Client.bucketExists(this.bucketName);
      if (!exists) {
        throw new InternalServerErrorException('S3 bucket does not exist');
      }
    } catch (error) {
      console.log(error);
      throw new InternalServerErrorException(
        'Error accessing S3 bucket!||កំហុសក្នុងការចូលប្រើ S3 bucket!',
      );
    }

    const extension = originalName.includes('.')
      ? originalName.split('.').pop()
      : undefined;
    const fileType = this.detectType(mimeType);
    const folder = this.folderFor(fileType);
    const path = `/${folder}/${randomUUID()}${extension ? `.${extension}` : ''}`;

    try {
      await this.s3Client.putObject(this.bucketName, path, buffer, buffer.length, {
        'Content-Type': mimeType,
      });
    } catch (error) {
      console.log(error);
      throw new InternalServerErrorException(
        'Failed to upload file!||បរាជ័យក្នុងការផ្ទុកឡើងឯកសារ!',
      );
    }

    return new UploadedAttachmentDto({
      file_url: path,
      file_type: fileType,
    });
  }

  private detectType(mimeType: string): attachment_type {
    if (mimeType.startsWith('image/')) return attachment_type.image;
    if (mimeType.startsWith('video/')) return attachment_type.video;
    if (mimeType.startsWith('audio/')) return attachment_type.audio;
    return attachment_type.file;
  }

  private folderFor(fileType: attachment_type): string {
    switch (fileType) {
      case attachment_type.image:
        return 'images';
      case attachment_type.video:
        return 'video';
      case attachment_type.audio:
        return 'audio';
      default:
        return 'files';
    }
  }
}
