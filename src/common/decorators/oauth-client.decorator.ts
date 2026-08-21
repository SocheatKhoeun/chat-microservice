import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import type { oauth_clients } from '../../../generated/prisma/client';

export const CurrentOauthClient = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): oauth_clients => {
    const request = ctx
      .switchToHttp()
      .getRequest<Request & { oauthClient: oauth_clients }>();
    return request.oauthClient;
  },
);
