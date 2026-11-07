import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import {
  GITHUB_REPOSITORY_RESOLVER,
  UnavailableGitHubRepositoryResolver,
} from './repository-resolver';

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [ProjectsController],
  providers: [
    ProjectsService,
    {
      provide: GITHUB_REPOSITORY_RESOLVER,
      useClass: UnavailableGitHubRepositoryResolver,
    },
  ],
})
export class ProjectsModule {}
