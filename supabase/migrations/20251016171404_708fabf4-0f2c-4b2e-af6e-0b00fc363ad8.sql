-- Remove a função quebrada
DROP FUNCTION IF EXISTS public.securely_update_user_api_key(text);

-- Cria a nova função que usa o Vault
CREATE OR REPLACE FUNCTION public.update_user_api_key_in_vault(
  api_key_plaintext TEXT
)
RETURNS VOID AS $$
DECLARE
  user_id UUID := auth.uid();
  secret_name TEXT := 'gemini_api_key_' || user_id::text;
BEGIN
  -- O Vault armazena o segredo associado ao nome único
  PERFORM vault.create_secret(api_key_plaintext, secret_name, 'Gemini API key for user ' || user_id::text);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;