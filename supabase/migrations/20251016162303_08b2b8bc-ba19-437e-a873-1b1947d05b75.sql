-- Função para descriptografar a API key do usuário
CREATE OR REPLACE FUNCTION public.decrypt_api_key(encrypted_key bytea)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  decrypted_text text;
BEGIN
  -- Descriptografa usando pgsodium
  decrypted_text := convert_from(
    pgsodium.crypto_secretbox_open(
      encrypted_key,
      (select decryption_secret from vault.decryption_secrets limit 1)
    ),
    'utf8'
  );
  
  RETURN decrypted_text;
END;
$$;