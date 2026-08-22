import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { SettingService } from '../../core/services/setting/setting.service';
import { PrismaService } from '../../core/services/prisma/prisma.service';
import { OauthGuard } from 'src/common/guards/oauth/oauth.guard';
import { LoginController } from './login/login.controller';
import { LoginService } from './login/login.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [LoginController],
  providers: [LoginService, SettingService, PrismaService, OauthGuard],
  exports: [LoginService],
})
export class AuthModule {}
