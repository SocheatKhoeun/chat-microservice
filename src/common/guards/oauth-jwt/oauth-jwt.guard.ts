import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { SettingService } from 'src/core/services/setting/setting.service';

@Injectable()
export class OauthJwtGuard implements CanActivate {
  constructor(
    private readonly settingService: SettingService,
    private readonly jwtService: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const secret = await this.settingService.getSecret();

    const request = context.switchToHttp().getRequest();
    const authorization = request.headers.authorization;

    if (!authorization) throw new UnauthorizedException(['Unauthorize access is not allowed||បាត់កូដសម្គាល់កម្មវិធី!']);

    const [bearer, jwtToken] = authorization.split(' ');

    if (bearer !== 'Bearer' || !jwtToken)
      throw new UnauthorizedException(['Unauthorize access is not allowed||បាត់កូដសម្គាល់កម្មវិធី!']);

    let token: any;

    try {
      token = await this.jwtService.verifyAsync(jwtToken, { secret });
    } catch (error) {
      throw new UnauthorizedException(['Token is invalid or expired||កូដសម្គាល់កម្មវិធីមិនត្រឹមត្រូវ ឬ ផុតកំណត់!']);
    }

    request.token = token;

    return true;
  }
}
