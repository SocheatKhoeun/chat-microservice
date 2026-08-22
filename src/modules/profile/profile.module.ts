import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaService } from '../../core/services/prisma/prisma.service';
import { SettingService } from '../../core/services/setting/setting.service';
import { OauthJwtGuard } from 'src/common/guards/oauth-jwt/oauth-jwt.guard';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [ProfileController],
  providers: [ProfileService, PrismaService, SettingService, OauthJwtGuard],
})
export class ProfileModule {}
