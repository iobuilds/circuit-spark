-- Projects, files, and per-project library lists. All scoped to auth.users.

CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text DEFAULT '',
  board text DEFAULT 'uno',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own projects select" ON public.projects FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own projects insert" ON public.projects FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own projects update" ON public.projects FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "own projects delete" ON public.projects FOR DELETE USING (auth.uid() = user_id);

CREATE TABLE public.project_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  path text NOT NULL,
  kind text NOT NULL DEFAULT 'source', -- 'source' | 'asset' | 'lib_zip'
  mime text,
  size integer NOT NULL DEFAULT 0,
  content text,         -- inline text for source files
  storage_path text,    -- path in storage bucket for binary assets
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, path)
);
CREATE INDEX project_files_project_idx ON public.project_files(project_id);
ALTER TABLE public.project_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own files select" ON public.project_files FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own files insert" ON public.project_files FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own files update" ON public.project_files FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "own files delete" ON public.project_files FOR DELETE USING (auth.uid() = user_id);

CREATE TABLE public.project_libraries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  source text NOT NULL DEFAULT 'manual', -- 'manual' | 'auto'
  installed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, name)
);
ALTER TABLE public.project_libraries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own libs select" ON public.project_libraries FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own libs insert" ON public.project_libraries FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own libs update" ON public.project_libraries FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "own libs delete" ON public.project_libraries FOR DELETE USING (auth.uid() = user_id);

-- updated_at triggers reuse touch_custom_components_updated_at logic
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER projects_touch BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER project_files_touch BEFORE UPDATE ON public.project_files
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Private storage bucket for binary uploads
INSERT INTO storage.buckets (id, name, public)
VALUES ('project-files', 'project-files', false)
ON CONFLICT (id) DO NOTHING;

-- Owner-scoped storage policies. Folder convention: <user_id>/<project_id>/<path>
CREATE POLICY "own bucket read" ON storage.objects FOR SELECT
  USING (bucket_id = 'project-files' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "own bucket insert" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'project-files' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "own bucket update" ON storage.objects FOR UPDATE
  USING (bucket_id = 'project-files' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "own bucket delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'project-files' AND auth.uid()::text = (storage.foldername(name))[1]);
