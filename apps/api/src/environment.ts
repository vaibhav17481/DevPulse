import path from 'node:path';
import { loadEnvFile } from 'node:process';

export function loadRootEnvironment(): void {
  const envPath = path.resolve(__dirname, '../../../.env');

  try {
    loadEnvFile(envPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}
