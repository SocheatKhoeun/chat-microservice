import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { OauthJwtGuard } from '../../common/guards/oauth-jwt/oauth-jwt.guard';
import { PrismaService } from '../../core/services/prisma/prisma.service';
import { SettingService } from '../../core/services/setting/setting.service';
import { AttachmentsController } from './attachments.controller';
import { AttachmentsService } from './attachments.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [AttachmentsController],
  providers: [PrismaService, SettingService, OauthJwtGuard, AttachmentsService],
})
export class AttachmentsModule {}
