import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/services/prisma/prisma.service';
import { CreateUserDto } from './users.model';

@Injectable()
export class UsersService {
  constructor(private readonly prismaService: PrismaService) {}

  async create(oauthClientId: number, dto: CreateUserDto) {
    if (!dto.external_id)
      return this.prismaService.users.create({
        data: { oauth_client_id: oauthClientId },
      });

    const existing = await this.prismaService.users.findUnique({
      where: { external_id: dto.external_id },
    });

    if (existing) {
      if (existing.oauth_client_id !== oauthClientId)
        throw new ConflictException(
          'This external_id is already registered under a different client!||external_id នេះត្រូវបានចុះឈ្មោះរួចហើយក្រោមអតិថិជនផ្សេង!',
        );

      return existing;
    }

    return this.prismaService.users.create({
      data: { external_id: dto.external_id, oauth_client_id: oauthClientId },
    });
  }
}
