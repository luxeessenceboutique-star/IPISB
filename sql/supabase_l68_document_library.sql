-- l68: unified document library — folder tree (max 3 levels) + files,
-- replacing the never-applied company_files (l66) / convention_files (l67).
-- Reference-code pattern mirrors the existing PUR-/DA-/REC-/INV- numbering
-- (supabase_l4_accounting_migration.sql etc.): a SEQUENCE + a column
-- DEFAULT that formats it, not an identity/generated column.

CREATE SEQUENCE IF NOT EXISTS document_folder_seq;

CREATE TABLE IF NOT EXISTS document_folders (
  id             uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  reference_code text        NOT NULL UNIQUE
                     DEFAULT ('DOS-' || lpad(nextval('document_folder_seq')::text, 6, '0')),
  name           text        NOT NULL,
  parent_id      uuid        REFERENCES document_folders(id) ON DELETE CASCADE,
  depth          int         NOT NULL DEFAULT 0,  -- 0/1/2 = 3 levels; enforced in the API, not here
  created_by     uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_document_folders_parent ON document_folders(parent_id);
ALTER TABLE document_folders ENABLE ROW LEVEL SECURITY;

CREATE SEQUENCE IF NOT EXISTS document_file_seq;

CREATE TABLE IF NOT EXISTS document_files (
  id             uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  reference_code text        NOT NULL UNIQUE
                     DEFAULT ('DOC-' || lpad(nextval('document_file_seq')::text, 6, '0')),
  folder_id      uuid        REFERENCES document_folders(id) ON DELETE CASCADE,  -- NULL = unfiled
  title          text        NOT NULL,
  source         text        NOT NULL CHECK (source IN ('import', 'composed')),
  filename       text,                 -- NULL for composed docs
  file_path      text        NOT NULL, -- path within the "document-files" bucket
  content_type   text,
  body_html      text,                 -- TipTap HTML source, source='composed' only — re-editing re-renders the PDF
  uploaded_by    uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_document_files_folder ON document_files(folder_id);
ALTER TABLE document_files ENABLE ROW LEVEL SECURITY;
-- No SELECT policy on either table: backend (service key) only, same as employee_files/company_files.

DROP TRIGGER IF EXISTS trg_document_files_updated_at ON document_files;
CREATE TRIGGER trg_document_files_updated_at
  BEFORE UPDATE ON document_files
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();  -- already defined in supabase_rh_phase2_migration.sql

INSERT INTO storage.buckets (id, name, public)
VALUES ('document-files', 'document-files', false)
ON CONFLICT (id) DO NOTHING;
