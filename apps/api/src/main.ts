import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { getCorsOptions } from './cors';
import { loadRootEnvironment } from './environment';

async function bootstrap(): Promise<void> {
  loadRootEnvironment();

  const app = await NestFactory.create(AppModule);
  configureApp(app);

  const corsOptions = getCorsOptions();
  if (corsOptions) {
    app.enableCors(corsOptions);
  }

  app.enableShutdownHooks();

  await app.listen(process.env.PORT ?? 3001);
}
void bootstrap();
