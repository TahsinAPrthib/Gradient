-- CreateEnum
CREATE TYPE "Industry" AS ENUM ('SOFTWARE', 'FINANCE', 'HEALTHCARE', 'EDUCATION', 'CONSULTING', 'GOVERNMENT', 'MEDIA', 'MANUFACTURING', 'NONPROFIT', 'OTHER');

-- AlterTable
--
-- Prisma's generated version of this step was "DROP COLUMN industry, ADD COLUMN
-- industry Industry NOT NULL", which would have thrown away every existing
-- value (and failed outright, because the table has rows and the new column is
-- required with no default).
--
-- Instead we convert the column in place. The USING clause runs once per row
-- and maps the old free text onto an enum member: comparison is done on
-- upper(btrim(...)) so "software", " Software " and "SOFTWARE" all land on
-- SOFTWARE, and a handful of common synonyms are folded in too. Anything we
-- don't recognise becomes OTHER, so no row can be lost and NOT NULL still holds.
ALTER TABLE "AlumniProfile"
  ALTER COLUMN "industry" TYPE "Industry"
  USING (
    CASE upper(btrim("industry"))
      WHEN 'SOFTWARE'      THEN 'SOFTWARE'
      WHEN 'TECH'          THEN 'SOFTWARE'
      WHEN 'TECHNOLOGY'    THEN 'SOFTWARE'
      WHEN 'IT'            THEN 'SOFTWARE'
      WHEN 'ENGINEERING'   THEN 'SOFTWARE'
      WHEN 'FINANCE'       THEN 'FINANCE'
      WHEN 'BANKING'       THEN 'FINANCE'
      WHEN 'HEALTHCARE'    THEN 'HEALTHCARE'
      WHEN 'HEALTH'        THEN 'HEALTHCARE'
      WHEN 'MEDICAL'       THEN 'HEALTHCARE'
      WHEN 'EDUCATION'     THEN 'EDUCATION'
      WHEN 'ACADEMIA'      THEN 'EDUCATION'
      WHEN 'CONSULTING'    THEN 'CONSULTING'
      WHEN 'GOVERNMENT'    THEN 'GOVERNMENT'
      WHEN 'PUBLIC SECTOR' THEN 'GOVERNMENT'
      WHEN 'MEDIA'         THEN 'MEDIA'
      WHEN 'MANUFACTURING' THEN 'MANUFACTURING'
      WHEN 'NONPROFIT'     THEN 'NONPROFIT'
      WHEN 'NON-PROFIT'    THEN 'NONPROFIT'
      WHEN 'NGO'           THEN 'NONPROFIT'
      ELSE 'OTHER'
    END
  )::"Industry";
