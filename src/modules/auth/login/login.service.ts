import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../../core/services/prisma/prisma.service';
import { SettingService } from '../../../core/services/setting/setting.service';
import { generateHash } from '../../../common/utils/generate-hash.util';
import { isUniqueConstraintViolation } from '../../../common/utils/prisma-error.util';
import type { users } from '../../../../generated/prisma/client';
import {
  AccessTokenPayload,
  AccessTokenResponseDto,
  LoginDto,
} from './login.model';

@Injectable()
export class LoginService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly jwtService: JwtService,
    private readonly settingService: SettingService,
  ) {}

  async login(
    oauthClientId: number,
    dto: LoginDto,
  ): Promise<AccessTokenResponseDto> {
    const user = await this.resolveUser(oauthClientId, dto);

    const access_token = await this.issueAccessToken({
      sub: user.id,
      client_id: oauthClientId,
    });

    return new AccessTokenResponseDto(access_token);
  }

  private async issueAccessToken(payload: AccessTokenPayload): Promise<string> {
    const secret = await this.settingService.getSecret();
    const sessionDuration = await this.settingService.getSessionDuration();
    const expiresIn = Number(sessionDuration);

    if (!Number.isFinite(expiresIn) || expiresIn <= 0)
      throw new InternalServerErrorException(
        'Invalid session duration configured!||រយៈពេលសម័យមិនត្រឹមត្រូវ!',
      );

    return this.jwtService.signAsync(payload, { secret, expiresIn });
  }

  private async resolveUser(oauthClientId: number, dto: LoginDto) {
    if (!dto.user_id)
      return this.prismaService.users.create({
        data: { id: generateHash(), oauth_client_id: oauthClientId },
      });

    const existing = await this.prismaService.users.findUnique({
      where: { id: dto.user_id },
    });

    if (existing) return this.assertOwnedByClient(existing, oauthClientId);

    let created: users;
    try {
      created = await this.prismaService.users.create({
        data: { id: dto.user_id, oauth_client_id: oauthClientId },
      });
    } catch (error) {
      if (!isUniqueConstraintViolation(error)) throw error;

      // Another concurrent login request created this user_id first.
      created = await this.prismaService.users.findUniqueOrThrow({
        where: { id: dto.user_id },
      });
    }

    return this.assertOwnedByClient(created, oauthClientId);
  }

  private assertOwnedByClient<T extends { oauth_client_id: number | null }>(
    user: T,
    oauthClientId: number,
  ): T {
    if (user.oauth_client_id !== oauthClientId)
      throw new ConflictException(
        'This user_id is already registered under a different client!||user_id នេះត្រូវបានចុះឈ្មោះរួចហើយក្រោមអតិថិជនផ្សេង!',
      );

    return user;
  }
}
