-- 1. Tabela para registrar ações propostas pela IA que requerem confirmação
CREATE TABLE public.agent_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  chat_message_id BIGINT REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  
  -- Tipo da ação: executar SQL, editar arquivo, etc.
  action_type TEXT NOT NULL, 
  
  -- O payload da ação, em JSON. Ex: { "sql": "DELETE FROM users;" }
  payload JSONB NOT NULL,
  
  -- Status: pendente, confirmado, executado, cancelado
  status TEXT NOT NULL DEFAULT 'pending', 
  
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  executed_at TIMESTAMPTZ
);

-- 2. RLS. SEMPRE.
ALTER TABLE public.agent_actions ENABLE ROW LEVEL SECURITY;

-- 3. Políticas: Usuário só vê e interage com ações dos seus próprios projetos.
CREATE POLICY "Allow users to manage actions on their own projects"
  ON public.agent_actions FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.id = agent_actions.project_id AND projects.user_id = auth.uid()
  ));

-- 4. Índice pra acelerar buscas
CREATE INDEX idx_agent_actions_project_id_status ON public.agent_actions(project_id, status);