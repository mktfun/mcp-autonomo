-- Adicionar coluna description à tabela projects
ALTER TABLE public.projects 
ADD COLUMN IF NOT EXISTS description TEXT;