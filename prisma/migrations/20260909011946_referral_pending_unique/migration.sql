-- Stops a student from having two *pending* referral requests to the same
-- alumnus for the same company and role.
--
-- Two things make this a partial, expression-based index rather than a plain
-- @@unique in schema.prisma:
--
--   1. WHERE status = 'PENDING' — once a request is DECLINED or REFERRED the
--      student should be free to ask again, so only pending rows may collide.
--   2. lower(...) — "Google" and "google" are the same company. Comparing the
--      lowered values means casing can't be used to sneak a duplicate past it.
--
-- ⚠️ MAINTENANCE NOTE: Prisma's schema language cannot express a partial or
-- expression index, so `prisma migrate dev` does not know this exists and will
-- try to generate a `DROP INDEX` for it in the next migration it creates.
-- If you see that in a generated migration, delete the DROP line before
-- applying. The application also checks for duplicates before inserting, so
-- losing this index degrades the guarantee rather than breaking the feature.
CREATE UNIQUE INDEX "ReferralRequest_pending_unique"
  ON "ReferralRequest" (
    "studentId",
    "alumniId",
    lower("targetCompany"),
    lower("targetRole")
  )
  WHERE status = 'PENDING';
