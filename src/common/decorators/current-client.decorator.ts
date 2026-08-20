import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { oauth_clients } from '../../../generated/prisma/client';

/**
 * The integration (calling project) authenticated by `ClientAuthGuard`.
 * Only usable on routes guarded by it — `ClientAuthGuard` is what attaches
 * `request.client`.
 */
export const CurrentClient = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): oauth_clients => {
    const request = ctx
      .switchToHttp()
      .getRequest<Request & { client: oauth_clients }>();
    return request.client;
  },
);
