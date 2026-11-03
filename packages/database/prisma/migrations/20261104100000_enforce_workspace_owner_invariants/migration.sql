-- Enforce the workspace ownership invariant at the database boundary.
--
-- The application already creates the workspace and its OWNER membership in one
-- transaction. These triggers protect the same invariant from future membership
-- code paths, direct database writes, and concurrent membership changes.

-- Refuse to install the invariant if existing data already violates it. This
-- migration does not silently repair ownership.
DO $$
DECLARE
  invalid_workspace_id uuid;
BEGIN
  SELECT "id"
  INTO invalid_workspace_id
  FROM "workspaces"
  WHERE NOT EXISTS (
    SELECT 1
    FROM "workspace_members"
    WHERE "workspace_members"."workspace_id" = "workspaces"."id"
      AND "workspace_members"."role" = 'OWNER'
  )
  LIMIT 1;

  IF invalid_workspace_id IS NOT NULL THEN
    RAISE EXCEPTION 'Workspace % has no OWNER; ownership must be repaired before this migration can be applied', invalid_workspace_id
      USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE FUNCTION "devpulse_require_workspace_owner_on_insert"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "workspaces"
    WHERE "id" = NEW."id"
  ) AND NOT EXISTS (
    SELECT 1
    FROM "workspace_members"
    WHERE "workspace_id" = NEW."id"
      AND "role" = 'OWNER'
  ) THEN
    RAISE EXCEPTION 'Workspace % must have at least one OWNER', NEW."id"
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER "devpulse_workspaces_require_owner"
AFTER INSERT ON "workspaces"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "devpulse_require_workspace_owner_on_insert"();

CREATE FUNCTION "devpulse_enforce_workspace_owner_on_membership_change"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_workspace_id uuid;
  remaining_owner_count integer;
BEGIN
  target_workspace_id := OLD."workspace_id";

  IF OLD."role" <> 'OWNER' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW."role" = 'OWNER' THEN
    RETURN NEW;
  END IF;

  -- A cascading workspace delete removes the workspace first, so the parent row
  -- is absent by the time its memberships are removed. Allow that deletion path
  -- and reject last-owner removal only while the workspace still exists.
  IF NOT EXISTS (
    SELECT 1
    FROM "workspaces"
    WHERE "id" = target_workspace_id
  ) THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;

    RETURN NEW;
  END IF;

  -- Serialize membership changes for the same workspace. The lock is released
  -- when the transaction commits or rolls back. A hash collision can serialize
  -- unrelated workspaces, but cannot weaken the invariant.
  PERFORM pg_advisory_xact_lock(
    hashtext('devpulse.workspace_owner'),
    hashtext(target_workspace_id::text)
  );

  SELECT count(*)
  INTO remaining_owner_count
  FROM "workspace_members"
  WHERE "workspace_id" = target_workspace_id
    AND "role" = 'OWNER'
    AND "id" <> OLD."id";

  IF remaining_owner_count = 0 THEN
    RAISE EXCEPTION 'Workspace % must retain at least one OWNER', target_workspace_id
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "devpulse_workspace_members_require_owner"
BEFORE DELETE OR UPDATE OF "role" ON "workspace_members"
FOR EACH ROW
EXECUTE FUNCTION "devpulse_enforce_workspace_owner_on_membership_change"();
