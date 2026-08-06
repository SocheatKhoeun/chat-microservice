import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Request } from 'express';
import { PrismaService } from '../../core/services/prisma/prisma.service';


@Injectable()
export class ClientAuthGuard implements CanActivate {
  constructor(private readonly prismaService: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    const credentials = this.parseBasicAuth(request.headers.authorization);

    if (!credentials)
      throw new UnauthorizedException(
        'Missing client credentials!||គ្មានព័ត៌មានសម្ងាត់អតិថិជនទេ!',
      );

    const { clientId, clientSecret } = credentials;

    const client = await this.prismaService.oauth_clients.findUnique({
      where: { client_id: clientId },
    });

    if (!client || client.is_disabled)
      throw new UnauthorizedException(
        'Invalid client credentials!||ព័ត៌មានសម្ងាត់អតិថិជនមិនត្រឹមត្រូវ!',
      );

    const isSecretValid = await bcrypt.compare(
      clientSecret,
      client.client_secret,
    );

    if (!isSecretValid)
      throw new UnauthorizedException(
        'Invalid client credentials!||ព័ត៌មានសម្ងាត់អតិថិជនមិនត្រឹមត្រូវ!',
      );

    // make the authenticated client available to route handlers, e.g. via
    // the `@CurrentClient()` param decorator
    (request as Request & { client: typeof client }).client = client;

    return true;
  }

  private parseBasicAuth(
    authorization?: string,
  ): { clientId: string; clientSecret: string } | null {
    if (!authorization?.startsWith('Basic '))
      return null;

    const decoded = Buffer.from(authorization.slice(6), 'base64').toString(
      'utf8',
    );
    const separatorIndex = decoded.indexOf(':');

    if (separatorIndex === -1) return null;

    const clientId = decoded.slice(0, separatorIndex);
    const clientSecret = decoded.slice(separatorIndex + 1);

    if (!clientId || !clientSecret) return null;

    return { clientId, clientSecret };
  }
}
