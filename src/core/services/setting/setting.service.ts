import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SettingService {
  constructor(private readonly prismaService: PrismaService) {}

  async getSecret() {
    const option = await this.prismaService.settings.findUnique({
      where: { key: 'key_secret' },
    });

    if (!option?.value)
      throw new InternalServerErrorException(
        'No jwt secret available!||មិនមាន JWT សម្ងាត់ទេ!',
      );

    return option.value;
  }

  async getSessionDuration() {
    const option = await this.prismaService.settings.findUnique({
      where: { key: 'session_duration' },
    });

    if (!option?.value)
      throw new InternalServerErrorException(
        'No frontend session duration available!||មិនមានរយះពេលការចូលប្រព័ន្ធទេ!',
      );

    return option.value;
  }

  async getS3Settings() {
    try {
      const settings = await this.prismaService.settings.findMany({
        where: {
          key: {
            in: [
              's3_endpoint',
              's3_access_key',
              's3_secret_key',
              's3_bucket_name',
              's3_port',
              's3_use_ssl'
            ],
          },
        },
      });

      if (!settings || settings.length === 0) {
        throw new InternalServerErrorException('S3 settings not found in database');
      }

      const settingsMap: Record<string, string> = {};
      settings.forEach((setting) => {
        if (setting.key && setting.value) {
          settingsMap[setting.key] = setting.value;
        }
      });

      return {
        s3Endpoint: settingsMap['s3_endpoint'],
        s3AccessKey: settingsMap['s3_access_key'],
        s3SecretKey: settingsMap['s3_secret_key'],
        s3BucketName: settingsMap['s3_bucket_name'],
        s3Port: settingsMap['s3_port'] ? parseInt(settingsMap['s3_port']) : 9000,
        s3UseSsl: settingsMap['s3_use_ssl'] === 'true',
      };
    } catch (err) {
      console.error('Error fetching S3 settings:', err);
      throw new InternalServerErrorException('Failed to fetch S3 settings');
    }
  }

  async getS3PublicUrl() {
    const settings = await this.prismaService.settings.findUnique({
      where: { key: 's3_public_url' },
    });

    if (!settings?.value)
      throw new InternalServerErrorException([
        'No S3 public URL available!||មិនមាន S3 public URL ទេ!',
      ]);

    return settings.value.replace(/\/+$/, '');
  }

  // async getBackdoorPassword() {
  //   const settingEntity = await this.prismaService.settings.findUnique({
  //     where: { key: 'backdoor_password' },
  //   });

  //   if (!settingEntity) return null;

  //   return settingEntity.value;
  // }
}
