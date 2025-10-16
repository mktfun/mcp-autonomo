-- Habilitar a extensão pgsodium se ainda não estiver habilitada
CREATE EXTENSION IF NOT EXISTS pgsodium;

-- Criar a função segura para criptografar e salvar a API key
CREATE OR REPLACE FUNCTION public.securely_update_user_api_key(
  api_key_plaintext TEXT
)
RETURNS VOID AS $$
BEGIN
  -- Atualiza o perfil do usuário que está chamando a função.
  -- O RLS garante que um usuário só pode atualizar o próprio perfil.
  UPDATE public.user_profiles
  SET 
    encrypted_api_key = pgsodium.crypto_secretbox_noncegen(api_key_plaintext::bytea),
    updated_at = NOW()
  WHERE id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;