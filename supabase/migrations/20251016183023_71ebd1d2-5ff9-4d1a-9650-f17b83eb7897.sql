-- 1. Tabela para armazenar as mensagens de cada projeto
CREATE TABLE public.chat_messages (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  
  -- 'user' para mensagens do usuário, 'ai' para respostas do modelo
  role TEXT NOT NULL CHECK (role IN ('user', 'ai')),
  
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 2. HABILITAR RLS
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- 3. Políticas: Usuário só pode ver e criar mensagens nos seus próprios projetos
CREATE POLICY "Allow users to view messages in their own projects"
  ON public.chat_messages FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.id = chat_messages.project_id AND projects.user_id = auth.uid()
  ));

CREATE POLICY "Allow users to insert messages in their own projects"
  ON public.chat_messages FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.id = chat_messages.project_id AND projects.user_id = auth.uid()
  ));

-- 4. Criar um índice pra acelerar a busca por histórico
CREATE INDEX idx_chat_messages_project_id ON public.chat_messages(project_id, created_at DESC);