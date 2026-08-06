import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api/v1');

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
  );

  const allowedOrigins = process.env.ALLOW_CORS?.split(',').map((origin) => origin.trim());
  app.enableCors({
    origin: allowedOrigins?.includes('*') ? true : allowedOrigins,
  });

  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('API Documentation')
      .setVersion('1.0')
      .addBasicAuth(
        { type: 'http', scheme: 'basic' },
        'client-credentials',
      )
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('swagger', app, document);
  }

  await app.listen(process.env.PORT ?? 3000);
  console.log('\n----------------------------------------------');
  console.log(`Application is running on port: ${process.env.PORT ?? 3000}`);
  console.log(`UTC Time: ${new Date().toLocaleString('en-US', { timeZone: 'UTC' })}`);
  console.log(`Cambodia Time: ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Phnom_Penh' })}`);
  console.log('----------------------------------------------');
}
bootstrap();
