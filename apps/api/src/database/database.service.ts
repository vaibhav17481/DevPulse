import { Injectable, OnModuleDestroy } from '@nestjs/common';
import {
  createDatabaseClient,
  type DatabaseClient,
} from '@devpulse/database';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  readonly client: DatabaseClient = createDatabaseClient();

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}
