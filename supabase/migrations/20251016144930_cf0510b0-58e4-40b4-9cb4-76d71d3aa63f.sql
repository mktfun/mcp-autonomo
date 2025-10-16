-- 1. Tabela para armazenar os projetos de cada usuário
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  -- Credenciais do Supabase (IMPORTANTE: Serão criptografadas)
  supabase_project_url TEXT,
  encrypted_supabase_api_key BYTEA,

  -- Credenciais do GitHub (IMPORTANTE: Serão criptografadas)
  github_repo_name TEXT,
  github_repo_owner TEXT,
  encrypted_github_pat BYTEA
);

-- 2. Habilitar Row Level Security (RLS)
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- 3. Políticas de RLS: Usuários só podem ver e mexer nos seus próprios projetos
CREATE POLICY "Allow users to view their own projects"
  ON public.projects FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Allow users to insert their own projects"
  ON public.projects FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Allow users to update their own projects"
  ON public.projects FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Allow users to delete their own projects"
  ON public.projects FOR DELETE
  USING (auth.uid() = user_id);