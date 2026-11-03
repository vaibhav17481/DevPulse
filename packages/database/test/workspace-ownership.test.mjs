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

function uniqueIds() {
  return {
    userOne: randomUUID(),
    userTwo: randomUUID(),
    workspace: randomUUID(),
    membershipOne: randomUUID(),
    membershipTwo: randomUUID(),
  };
}

async function insertUsers(client, ids) {
  await client.query(
    `INSERT INTO "users" ("id", "email", "updated_at")
     VALUES ($1, $2, now()), ($3, $4, now())`,
    [
      ids.userOne,
      `b7e-${ids.userOne}@example.com`,
      ids.userTwo,
      `b7e-${ids.userTwo}@example.com`,
    ],
  );
}

async function insertWorkspaceWithOwners(client, ids, ownerCount = 2) {
  await client.query('BEGIN');

  try {
    await insertUsers(client, ids);
    await client.query(
      `INSERT INTO "workspaces" ("id", "name", "slug", "updated_at")
       VALUES ($1, 'Ownership test', $2, now())`,
      [ids.workspace, `ownership-${ids.workspace}`],
    );
    await client.query(
      `INSERT INTO "workspace_members"
         ("id", "workspace_id", "user_id", "role", "updated_at")
       VALUES ($1, $2, $3, 'OWNER', now())`,
      [ids.membershipOne, ids.workspace, ids.userOne],
    );

    if (ownerCount === 2) {
      await client.query(
        `INSERT INTO "workspace_members"
           ("id", "workspace_id", "user_id", "role", "updated_at")
         VALUES ($1, $2, $3, 'OWNER', now())`,
        [ids.membershipTwo, ids.workspace, ids.userTwo],
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function cleanup(ids) {
  await withClient(async (client) => {
    await client.query('DELETE FROM "workspaces" WHERE "id" = $1', [
      ids.workspace,
    ]);
    await client.query('DELETE FROM "users" WHERE "id" = ANY($1::uuid[])', [
      [ids.userOne, ids.userTwo],
    ]);
  });
}

async function countOwners(workspaceId) {
  return withClient(async (client) => {
    const result = await client.query(
      `SELECT count(*)::int AS "count"
       FROM "workspace_members"
       WHERE "workspace_id" = $1 AND "role" = 'OWNER'`,
      [workspaceId],
    );

    return result.rows[0].count;
  });
}

test(
  'rejects a workspace committed without an OWNER',
  { skip },
  async () => {
    const ids = uniqueIds();

    await assert.rejects(
      withClient(async (client) => {
        await client.query('BEGIN');

        try {
          await insertUsers(client, ids);
          await client.query(
            `INSERT INTO "workspaces" ("id", "name", "slug", "updated_at")
             VALUES ($1, 'No owner', $2, now())`,
            [ids.workspace, `no-owner-${ids.workspace}`],
          );
          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        }
      }),
      /must have at least one OWNER/,
    );

    await withClient(async (client) => {
      const workspace = await client.query(
        'SELECT 1 FROM "workspaces" WHERE "id" = $1',
        [ids.workspace],
      );
      const users = await client.query(
        'SELECT 1 FROM "users" WHERE "id" = ANY($1::uuid[])',
        [[ids.userOne, ids.userTwo]],
      );

      assert.equal(workspace.rowCount, 0);
      assert.equal(users.rowCount, 0);
    });
  },
);

test(
  'protects the last OWNER and supports transactional transfer',
  { skip },
  async () => {
    const ids = uniqueIds();

    try {
      await withClient(async (client) => {
        await insertWorkspaceWithOwners(client, ids, 1);

        await assert.rejects(
          client.query(
            'DELETE FROM "workspace_members" WHERE "id" = $1',
            [ids.membershipOne],
          ),
          /must retain at least one OWNER/,
        );
        await assert.rejects(
          client.query(
            `UPDATE "workspace_members" SET "role" = 'ADMIN' WHERE "id" = $1`,
            [ids.membershipOne],
          ),
          /must retain at least one OWNER/,
        );

        await client.query(
          `INSERT INTO "workspace_members"
             ("id", "workspace_id", "user_id", "role", "updated_at")
           VALUES ($1, $2, $3, 'OWNER', now())`,
          [ids.membershipTwo, ids.workspace, ids.userTwo],
        );
        await client.query(
          `UPDATE "workspace_members" SET "role" = 'ADMIN' WHERE "id" = $1`,
          [ids.membershipOne],
        );

        assert.equal(await countOwners(ids.workspace), 1);
      });
    } finally {
      await cleanup(ids);
    }
  },
);

test(
  'serializes concurrent demotions and preserves one OWNER',
  { skip },
  async () => {
    const ids = uniqueIds();
    const first = new Client({ connectionString });
    const second = new Client({ connectionString });

    try {
      await withClient(async (client) => {
        await insertWorkspaceWithOwners(client, ids);
      });
      await Promise.all([first.connect(), second.connect()]);
      await Promise.all([first.query('BEGIN'), second.query('BEGIN')]);

      const firstUpdate = first
        .query(
          `UPDATE "workspace_members" SET "role" = 'ADMIN' WHERE "id" = $1`,
          [ids.membershipOne],
        )
        .then(
          () => ({ client: first, succeeded: true }),
          (error) => ({ client: first, succeeded: false, error }),
        );
      const secondUpdate = second
        .query(
          `UPDATE "workspace_members" SET "role" = 'ADMIN' WHERE "id" = $1`,
          [ids.membershipTwo],
        )
        .then(
          () => ({ client: second, succeeded: true }),
          (error) => ({ client: second, succeeded: false, error }),
        );

      const winner = await Promise.race([firstUpdate, secondUpdate]);
      assert.equal(winner.succeeded, true);
      await winner.client.query('COMMIT');

      const loser =
        winner.client === first ? await secondUpdate : await firstUpdate;
      assert.equal(loser.succeeded, false);
      assert.match(
        loser.error.message,
        /must retain at least one OWNER/,
      );
      await loser.client.query('ROLLBACK');

      assert.equal(await countOwners(ids.workspace), 1);
    } finally {
      await Promise.all([first.end(), second.end()]);
      await cleanup(ids);
    }
  },
);

test(
  'serializes concurrent owner deletions and preserves one OWNER',
  { skip },
  async () => {
    const ids = uniqueIds();
    const first = new Client({ connectionString });
    const second = new Client({ connectionString });

    try {
      await withClient(async (client) => {
        await insertWorkspaceWithOwners(client, ids);
      });
      await Promise.all([first.connect(), second.connect()]);
      await Promise.all([first.query('BEGIN'), second.query('BEGIN')]);

      const firstDelete = first
        .query('DELETE FROM "workspace_members" WHERE "id" = $1', [
          ids.membershipOne,
        ])
        .then(
          () => ({ client: first, succeeded: true }),
          (error) => ({ client: first, succeeded: false, error }),
        );
      const secondDelete = second
        .query('DELETE FROM "workspace_members" WHERE "id" = $1', [
          ids.membershipTwo,
        ])
        .then(
          () => ({ client: second, succeeded: true }),
          (error) => ({ client: second, succeeded: false, error }),
        );

      const winner = await Promise.race([firstDelete, secondDelete]);
      assert.equal(winner.succeeded, true);
      await winner.client.query('COMMIT');

      const loser =
        winner.client === first ? await secondDelete : await firstDelete;
      assert.equal(loser.succeeded, false);
      assert.match(
        loser.error.message,
        /must retain at least one OWNER/,
      );
      await loser.client.query('ROLLBACK');

      assert.equal(await countOwners(ids.workspace), 1);
    } finally {
      await Promise.all([first.end(), second.end()]);
      await cleanup(ids);
    }
  },
);

test(
  'rejects bulk demotion or deletion of every OWNER',
  { skip },
  async () => {
    const ids = uniqueIds();

    try {
      await withClient(async (client) => {
        await insertWorkspaceWithOwners(client, ids);

        await assert.rejects(
          client.query(
            `UPDATE "workspace_members" SET "role" = 'ADMIN'
             WHERE "workspace_id" = $1`,
            [ids.workspace],
          ),
          /must retain at least one OWNER/,
        );
        await assert.rejects(
          client.query(
            'DELETE FROM "workspace_members" WHERE "workspace_id" = $1',
            [ids.workspace],
          ),
          /must retain at least one OWNER/,
        );
      });

      assert.equal(await countOwners(ids.workspace), 2);
    } finally {
      await cleanup(ids);
    }
  },
);

test(
  'allows workspace deletion to cascade through owner memberships',
  { skip },
  async () => {
    const ids = uniqueIds();

    await withClient(async (client) => {
      await insertWorkspaceWithOwners(client, ids);
    });

    await withClient(async (client) => {
      await client.query('DELETE FROM "workspaces" WHERE "id" = $1', [
        ids.workspace,
      ]);
      await client.query(
        'DELETE FROM "users" WHERE "id" = ANY($1::uuid[])',
        [[ids.userOne, ids.userTwo]],
      );
    });

    await withClient(async (client) => {
      const membership = await client.query(
        'SELECT 1 FROM "workspace_members" WHERE "workspace_id" = $1',
        [ids.workspace],
      );

      assert.equal(membership.rowCount, 0);
    });
  },
);
