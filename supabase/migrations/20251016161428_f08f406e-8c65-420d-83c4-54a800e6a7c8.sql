-- 1. Tabela para armazenar perfis e configurações de IA dos usuários
CREATE TABLE public.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Configurações do Agente de IA
  ai_provider TEXT DEFAULT 'gemini',
  ai_model TEXT DEFAULT 'gemini-2.5-flash',
  encrypted_api_key BYTEA,
  system_instruction TEXT,
  temperature NUMERIC DEFAULT 0.7 CHECK (temperature >= 0 AND temperature <= 1)
);

-- 2. Habilitar RLS
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- 3. Políticas: Usuário só mexe no que é dele
CREATE POLICY "Allow users to view their own profile"
  ON public.user_profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Allow users to insert their own profile"
  ON public.user_profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Allow users to update their own profile"
  ON public.user_profiles FOR UPDATE
  USING (auth.uid() = id);

-- 4. Função para criar um perfil automaticamente quando um novo usuário se registra
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id)
  VALUES (new.id);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 5. Gatilho (trigger) que chama a função acima
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 6. Função para criptografar a API key do usuário
CREATE OR REPLACE FUNCTION public.update_user_encrypted_api_key(
  p_api_key TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_user_id uuid;
  v_encrypted_key bytea;
BEGIN
  -- Get the user_id of the authenticated user
  v_user_id := auth.uid();
  
  -- Encrypt the API key if provided
  IF p_api_key IS NOT NULL THEN
    v_encrypted_key := pgsodium.crypto_secretbox_noncegen(
      p_api_key::bytea
    );
  END IF;
  
  -- Update the user profile with encrypted API key
  UPDATE public.user_profiles
  SET
    encrypted_api_key = v_encrypted_key,
    updated_at = NOW()
  WHERE id = v_user_id;
  
  RETURN json_build_object(
    'success', true,
    'message', 'API key updated successfully'
  );
END;
$$;