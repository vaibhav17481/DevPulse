// Run against a migrated disposable database with:
// DATABASE_URL=... pnpm --filter @devpulse/database test:integration
// The tests create and remove isolated rows; they do not reset the database.

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import pg from 'pg';

const { Client } = pg;

function getConnectionString() {
  const value = process.env.DATABASE_URL;

  if (!value) {
    return undefined;
  }

  const url = new URL(value);
  url.searchParams.delete('schema');

  return url.toString();
}

const connectionString = getConnectionString();
const skip = connectionString
  ? false
  : 'DATABASE_URL is required for database integration tests';

async function withClient(callback) {
  const client = new Client({ connectionString });
  await client.connect();

  try {
    return await callback(client);
  } finally {
    await client.end();
  }
}

function randomBigInt() {
  return BigInt(
    `0x${randomUUID().replaceAll('-', '').slice(0, 15)}`,
  );
}

function uniqueIds() {
  return {
    userOne: randomUUID(),
    userTwo: randomUUID(),
    workspaceOne: randomUUID(),
    workspaceTwo: randomUUID(),
    membershipOne: randomUUID(),
    membershipTwo: randomUUID(),
    installationOne: randomUUID(),
    installationTwo: randomUUID(),
    projectOne: randomUUID(),
    projectTwo: randomUUID(),
    repositoryOne: randomUUID(),
    repositoryTwo: randomUUID(),
  };
}

async function insertWorkspaceWithOwner(
  client,
  workspaceId,
  userId,
  membershipId,
) {
  await client.query(
    `INSERT INTO "users" ("id", "email", "updated_at")
     VALUES ($1, $2, now())`,
    [userId, `${userId}@example.com`],
  );
  await client.query(
    `INSERT INTO "workspaces" ("id", "name", "slug", "updated_at")
     VALUES ($1, 'Project integrity test', $2, now())`,
    [workspaceId, `project-integrity-${workspaceId}`],
  );
  await client.query(
    `INSERT INTO "workspace_members"
       ("id", "workspace_id", "user_id", "role", "updated_at")
     VALUES ($1, $2, $3, 'OWNER', now())`,
    [membershipId, workspaceId, userId],
  );
}

async function insertInstallation(client, installationId, workspaceId) {
  await client.query(
    `INSERT INTO "github_installations"
       ("id", "workspace_id", "github_installation_id", "account_login",
        "account_type", "updated_at")
     VALUES ($1, $2, $3, 'acme', 'USER', now())`,
    [installationId, workspaceId, randomBigInt().toString()],
  );
}

async function insertProject(client, projectId, workspaceId, name) {
  await client.query(
    `INSERT INTO "projects"
       ("id", "workspace_id", "name", "slug", "updated_at")
     VALUES ($1, $2, $3, $4, now())`,
    [projectId, workspaceId, name, `${name}-${projectId}`],
  );
}

async function insertRepository(
  client,
  {
    repositoryId,
    workspaceId,
    projectId,
    installationId,
    githubId = randomBigInt(),
  },
) {
  await client.query(
    `INSERT INTO "repositories"
       ("id", "workspace_id", "project_id", "installation_id", "github_id",
        "owner_login", "name", "full_name", "visibility", "updated_at")
     VALUES ($1, $2, $3, $4, $5, 'acme', 'checkout-api',
             $6, 'PRIVATE', now())`,
    [
      repositoryId,
      workspaceId,
      projectId,
      installationId,
      githubId.toString(),
      `acme/checkout-api-${repositoryId}`,
    ],
  );
}

async function cleanup(client, ids) {
  await client.query(
    'DELETE FROM "repositories" WHERE "workspace_id" = ANY($1::uuid[])',
    [[ids.workspaceOne, ids.workspaceTwo]],
  );
  await client.query(
    'DELETE FROM "projects" WHERE "workspace_id" = ANY($1::uuid[])',
    [[ids.workspaceOne, ids.workspaceTwo]],
  );
  await client.query(
    'DELETE FROM "github_installations" WHERE "workspace_id" = ANY($1::uuid[])',
    [[ids.workspaceOne, ids.workspaceTwo]],
  );
  await client.query(
    'DELETE FROM "workspaces" WHERE "id" = ANY($1::uuid[])',
    [[ids.workspaceOne, ids.workspaceTwo]],
  );
  await client.query(
    'DELETE FROM "users" WHERE "id" = ANY($1::uuid[])',
    [[ids.userOne, ids.userTwo]],
  );
}

test(
  'rejects a repository whose project belongs to another workspace',
  { skip },
  async () => {
    const ids = uniqueIds();

    await withClient(async (client) => {
      try {
        await insertWorkspaceWithOwner(
          client,
          ids.workspaceOne,
          ids.userOne,
          ids.membershipOne,
        );
        await insertWorkspaceWithOwner(
          client,
          ids.workspaceTwo,
          ids.userTwo,
          ids.membershipTwo,
        );
        await insertInstallation(
          client,
          ids.installationTwo,
          ids.workspaceTwo,
        );
        await insertProject(
          client,
          ids.projectOne,
          ids.workspaceOne,
          'checkout-api',
        );

        await assert.rejects(
          insertRepository(client, {
            repositoryId: ids.repositoryOne,
            workspaceId: ids.workspaceTwo,
            projectId: ids.projectOne,
            installationId: ids.installationTwo,
          }),
          /repositories_project_id_workspace_id_fkey/,
        );
      } finally {
        await cleanup(client, ids);
      }
    });
  },
);

test(
  'rejects a second repository for the same project',
  { skip },
  async () => {
    const ids = uniqueIds();

    await withClient(async (client) => {
      try {
        await insertWorkspaceWithOwner(
          client,
          ids.workspaceOne,
          ids.userOne,
          ids.membershipOne,
        );
        await insertInstallation(
          client,
          ids.installationOne,
          ids.workspaceOne,
        );
        await insertProject(
          client,
          ids.projectOne,
          ids.workspaceOne,
          'checkout-api',
        );
        await insertRepository(client, {
          repositoryId: ids.repositoryOne,
          workspaceId: ids.workspaceOne,
          projectId: ids.projectOne,
          installationId: ids.installationOne,
        });

        await assert.rejects(
          insertRepository(client, {
            repositoryId: ids.repositoryTwo,
            workspaceId: ids.workspaceOne,
            projectId: ids.projectOne,
            installationId: ids.installationOne,
          }),
          /repositories_project_id_key/,
        );
      } finally {
        await cleanup(client, ids);
      }
    });
  },
);

test(
  'rejects the same GitHub repository in two workspaces',
  { skip },
  async () => {
    const ids = uniqueIds();
    const githubId = randomBigInt();

    await withClient(async (client) => {
      try {
        await insertWorkspaceWithOwner(
          client,
          ids.workspaceOne,
          ids.userOne,
          ids.membershipOne,
        );
        await insertWorkspaceWithOwner(
          client,
          ids.workspaceTwo,
          ids.userTwo,
          ids.membershipTwo,
        );
        await insertInstallation(
          client,
          ids.installationOne,
          ids.workspaceOne,
        );
        await insertInstallation(
          client,
          ids.installationTwo,
          ids.workspaceTwo,
        );
        await insertProject(
          client,
          ids.projectOne,
          ids.workspaceOne,
          'checkout-api',
        );
        await insertProject(
          client,
          ids.projectTwo,
          ids.workspaceTwo,
          'checkout-api',
        );
        await insertRepository(client, {
          repositoryId: ids.repositoryOne,
          workspaceId: ids.workspaceOne,
          projectId: ids.projectOne,
          installationId: ids.installationOne,
          githubId,
        });

        await assert.rejects(
          insertRepository(client, {
            repositoryId: ids.repositoryTwo,
            workspaceId: ids.workspaceTwo,
            projectId: ids.projectTwo,
            installationId: ids.installationTwo,
            githubId,
          }),
          /repositories_github_id_key/,
        );
      } finally {
        await cleanup(client, ids);
      }
    });
  },
);

test(
  'requires explicit child cleanup before deleting a project or workspace',
  { skip },
  async () => {
    const ids = uniqueIds();

    await withClient(async (client) => {
      try {
        await insertWorkspaceWithOwner(
          client,
          ids.workspaceOne,
          ids.userOne,
          ids.membershipOne,
        );
        await insertInstallation(
          client,
          ids.installationOne,
          ids.workspaceOne,
        );
        await insertProject(
          client,
          ids.projectOne,
          ids.workspaceOne,
          'checkout-api',
        );
        await insertRepository(client, {
          repositoryId: ids.repositoryOne,
          workspaceId: ids.workspaceOne,
          projectId: ids.projectOne,
          installationId: ids.installationOne,
        });

        await assert.rejects(
          client.query('DELETE FROM "projects" WHERE "id" = $1', [
            ids.projectOne,
          ]),
          /repositories_project_id_workspace_id_fkey/,
        );
        await assert.rejects(
          client.query('DELETE FROM "workspaces" WHERE "id" = $1', [
            ids.workspaceOne,
          ]),
          /projects_workspace_id_fkey/,
        );
      } finally {
        await cleanup(client, ids);
      }
    });
  },
);
