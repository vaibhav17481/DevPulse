import { ServiceUnavailableException } from '@nestjs/common';
import { PROJECT_REPOSITORY_RESOLUTION_UNAVAILABLE_MESSAGE } from './project.constants';
import { UnavailableGitHubRepositoryResolver } from './repository-resolver';

describe('UnavailableGitHubRepositoryResolver', () => {
  it('reports that GitHub repository verification is unavailable', async () => {
    const resolver = new UnavailableGitHubRepositoryResolver();

    await expect(
      resolver.resolve(
        '7f8f3b9e-4f16-4f8a-b3d7-9a7b7b5f6d02',
        123456789n,
      ),
    ).rejects.toThrow(ServiceUnavailableException);
    await expect(
      resolver.resolve(
        '7f8f3b9e-4f16-4f8a-b3d7-9a7b7b5f6d02',
        123456789n,
      ),
    ).rejects.toThrow(
      PROJECT_REPOSITORY_RESOLUTION_UNAVAILABLE_MESSAGE,
    );
  });
});
