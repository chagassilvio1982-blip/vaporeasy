-- Vaporize Next isolated homologation: READ ONLY fixture readiness inspection.
-- Project: cfpvexgkjsqpwhebsoos.
-- No passwords, emails, JWTs, or user IDs are returned.
-- Does not create or modify any user, organization, membership or client.
WITH roles AS (
  SELECT
    count(*) FILTER (WHERE m.status='active' AND m.role='owner') AS owners,
    count(*) FILTER (WHERE m.status='active' AND m.role='manager') AS managers,
    count(*) FILTER (WHERE m.status='active' AND m.role='collaborator') AS collaborators
  FROM vaporize_next.memberships m
  JOIN vaporize_next.organizations o ON o.id=m.organization_id
  WHERE o.status='active'
),
resources AS (
  SELECT
    (SELECT count(*) FROM auth.users) AS auth_users,
    (SELECT count(*) FROM vaporize_next.organizations) AS organizations,
    (SELECT count(*) FROM vaporize_next.memberships) AS memberships,
    (SELECT count(*) FROM vaporize_next.clients) AS clients,
    (SELECT count(*) FROM pg_policies WHERE schemaname='vaporize_next'
      AND tablename='clients' AND cmd='DELETE') AS delete_policies
)
SELECT resources.*, roles.*,
  (roles.owners>0 AND roles.managers>0 AND roles.collaborators>0) AS role_fixtures_ready,
  (resources.delete_policies>0) AS delete_policy_exists
FROM resources CROSS JOIN roles;
-- A DELETE policy is not required or recommended for the app merely to enable tests.
-- HTTP POST remains disabled until a separately verified admin cleanup exists.
