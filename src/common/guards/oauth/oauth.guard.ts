import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { compare } from 'bcrypt';
import { PrismaService } from 'src/core/services/prisma/prisma.service';

@Injectable()
export class OauthGuard implements CanActivate {
  constructor(private readonly prismaService: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const basic = request.headers.authorization;

    const basicMatch = /^Basic\s+([A-Za-z0-9._~+/]+=*)$/.exec(basic);
    if (!basicMatch)
      throw new UnauthorizedException([
        'invalid oauth clientId or clientSecret||ព័ត៌មានសម្គាល់កម្មវិធីមិនត្រឹមត្រូវ!',
      ]);

    const base64Credentials = basicMatch[1];
    const [clientId, clientSecret] = Buffer.from(base64Credentials, 'base64')
      .toString('ascii')
      .split(':');

    const oauthClient = await this.prismaService.oauth_clients.findUnique({
      where: { client_id: clientId },
    });

    if (!oauthClient || oauthClient.is_disabled)
      throw new UnauthorizedException([
        'invalid oauth clientId or clientSecret||ព័ត៌មានសម្គាល់កម្មវិធីមិនត្រឹមត្រូវ!',
      ]);

    if (!(await compare(clientSecret, oauthClient.client_secret)))
      throw new UnauthorizedException([
        'invalid oauth clientId or clientSecret||ព័ត៌មានសម្គាល់កម្មវិធីមិនត្រឹមត្រូវ!',
      ]);

    request.oauthClient = oauthClient;
    return true;
  }
}
