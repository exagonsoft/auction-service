/* eslint-disable prettier/prettier */
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { allowedDomains } from './settings/corsWhitelist';
import { AllExceptionsFilter } from './common/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable CORS
  app.enableCors({
    origin: allowedDomains, // Allowed origins
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE', // Allowed HTTP methods
    credentials: true, // Include cookies in CORS
  });

  // Enable global exception filter
  app.useGlobalFilters(new AllExceptionsFilter());

  await app.listen(process.env.APP_PORT);
  console.log(`🚀 APP running on port ${process.env.APP_PORT}`);
}
bootstrap();

