-- Applied to isolated homologation cfpvexgkjsqpwhebsoos on 2026-10-30.
-- Table grants are required in addition to RLS policies for PostgREST authenticated requests.
-- RLS still restricts writes to active owner/manager memberships and reads to members.
GRANT SELECT, INSERT, UPDATE ON TABLE vaporize_next.appointments TO authenticated;
