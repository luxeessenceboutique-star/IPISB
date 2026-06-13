-- RLS policies for the meetings table.
-- The frontend queries this table directly via the Supabase client (not the
-- FastAPI service key), so Row Level Security is the only enforcement layer.
--
-- Run this once in the Supabase SQL editor or via a migration.

ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;

-- ─── SELECT ──────────────────────────────────────────────────────────────────

-- Admins see all meetings.
CREATE POLICY "meetings_select_admin" ON meetings
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Professors see meetings in classes they own OR meetings they personally created
-- (covers meetings not tied to any class).
CREATE POLICY "meetings_select_professor" ON meetings
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid() AND role = 'professor'
    )
    AND (
      created_by = auth.uid()
      OR class_id IN (
        SELECT id FROM classes WHERE created_by = auth.uid()
      )
    )
  );

-- Students see only meetings for classes they are enrolled in.
-- Meetings with no class_id are not visible to students.
CREATE POLICY "meetings_select_student" ON meetings
  FOR SELECT TO authenticated
  USING (
    NOT EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid() AND role IN ('admin', 'professor')
    )
    AND class_id IN (
      SELECT class_id FROM class_students WHERE student_id = auth.uid()
    )
  );

-- ─── INSERT ──────────────────────────────────────────────────────────────────

-- Only admins and professors can create meetings.
CREATE POLICY "meetings_insert" ON meetings
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid() AND role IN ('admin', 'professor')
    )
  );

-- ─── UPDATE ──────────────────────────────────────────────────────────────────

-- Admins can update any meeting.
-- Professors can only update meetings they created (covers is_active toggling).
CREATE POLICY "meetings_update" ON meetings
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'
    )
    OR created_by = auth.uid()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'
    )
    OR created_by = auth.uid()
  );

-- ─── DELETE ──────────────────────────────────────────────────────────────────

-- Admins can delete any meeting.
-- Professors can only delete meetings they created.
CREATE POLICY "meetings_delete" ON meetings
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'
    )
    OR created_by = auth.uid()
  );
