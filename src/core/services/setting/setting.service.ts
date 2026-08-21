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

  // async getSessionDuration() {
  //   const option = await this.prismaService.settings.findUnique({
  //     where: { key: 'session_duration' },
  //   });

  //   if (!option?.value)
  //     throw new InternalServerErrorException(
  //       'No frontend session duration available!||មិនមានរយះពេលការចូលប្រព័ន្ធទេ!',
  //     );

  //   return option.value;
  // }

  // async getBackdoorPassword() {
  //   const settingEntity = await this.prismaService.settings.findUnique({
  //     where: { key: 'backdoor_password' },
  //   });

  //   if (!settingEntity) return null;

  //   return settingEntity.value;
  // }
}
