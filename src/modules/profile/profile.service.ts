import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/services/prisma/prisma.service';
import { ProfileResponseDto } from './profile.model';

@Injectable()
export class ProfileService {
  constructor(private readonly prismaService: PrismaService) {}

  async getProfile(userId: string): Promise<ProfileResponseDto> {
    const user = await this.prismaService.users.findUnique({
      where: { id: userId },
      select: { id: true, created_at: true, updated_at: true },
    });

    if (!user)
      throw new NotFoundException('User not found!||រកមិនឃើញអ្នកប្រើប្រាស់!');

    return new ProfileResponseDto(user);
  }
}
