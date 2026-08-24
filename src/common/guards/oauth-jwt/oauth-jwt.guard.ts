import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from 'src/core/services/prisma/prisma.service';
import { SettingService } from 'src/core/services/setting/setting.service';
import type { AccessTokenPayload } from 'src/modules/auth/login/login.model';

@Injectable()
export class OauthJwtGuard implements CanActivate {
  constructor(
    private readonly settingService: SettingService,
    private readonly jwtService: JwtService,
    private readonly prismaService: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const secret = await this.settingService.getSecret();

    const request = context.switchToHttp().getRequest();
    const authorization = request.headers.authorization;

    if (!authorization)
      throw new UnauthorizedException([
        'Unauthorize access is not allowed||បាត់កូដសម្គាល់កម្មវិធី!',
      ]);

    const [bearer, jwtToken] = authorization.split(' ');

    if (bearer !== 'Bearer' || !jwtToken)
      throw new UnauthorizedException([
        'Unauthorize access is not allowed||បាត់កូដសម្គាល់កម្មវិធី!',
      ]);

    let token: AccessTokenPayload;

    try {
      token = await this.jwtService.verifyAsync(jwtToken, { secret });
    } catch {
      throw new UnauthorizedException([
        'Token is invalid or expired||កូដសម្គាល់កម្មវិធីមិនត្រឹមត្រូវ ឬ ផុតកំណត់!',
      ]);
    }

    const user = await this.prismaService.users.findUnique({
      where: { id: token.sub },
    });

    if (!user || user.oauth_client_id !== token.client_id)
      throw new UnauthorizedException([
        'Token is invalid or expired||កូដសម្គាល់កម្មវិធីមិនត្រឹមត្រូវ ឬ ផុតកំណត់!',
      ]);

    request.token = token;
    request.user = user;

    return true;
  }
}
