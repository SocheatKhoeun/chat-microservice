import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');

  app.useGlobalPipes(new ValidationPipe({ transform: true }));

  // Enable CORS
  const allowedOrigins = (process.env.ALLOW_CORS ?? 'http://localhost:5000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.enableCors({
    origin: allowedOrigins.length === 1 ? allowedOrigins[0] : allowedOrigins,
  });

  // Only expose Swagger in non-production
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Chat Service API')
      .setDescription('API documentation')
      .setVersion('1.0')
      .addBearerAuth()
      .addBasicAuth()
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
