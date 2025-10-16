-- Phase 1: Fix Vault Function to Handle Duplicate Keys
-- Drop the existing function first
DROP FUNCTION IF EXISTS public.update_user_api_key_in_vault(text);

-- Recreate with DELETE logic to prevent duplicate key errors
CREATE OR REPLACE FUNCTION public.update_user_api_key_in_vault(api_key_plaintext TEXT)
RETURNS VOID AS $$
DECLARE
  user_id UUID := auth.uid();
  secret_name TEXT := 'gemini_api_key_' || user_id::text;
BEGIN
  -- Remove the old secret if it exists
  DELETE FROM vault.secrets WHERE name = secret_name;
  
  -- Create the new secret
  PERFORM vault.create_secret(
    api_key_plaintext, 
    secret_name, 
    'Gemini API key for user ' || user_id::text
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, vault;

-- Phase 3: Create Function to Decrypt Project Credentials
CREATE OR REPLACE FUNCTION public.decrypt_project_credentials(p_project_id UUID)
RETURNS TABLE(
  supabase_api_key TEXT,
  github_pat TEXT
) AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_encrypted_supabase BYTEA;
  v_encrypted_github BYTEA;
BEGIN
  -- Verify user owns the project
  SELECT encrypted_supabase_api_key, encrypted_github_pat
  INTO v_encrypted_supabase, v_encrypted_github
  FROM public.projects
  WHERE id = p_project_id AND user_id = v_user_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project not found or unauthorized';
  END IF;
  
  -- Decrypt and return (only if not NULL)
  RETURN QUERY SELECT
    CASE WHEN v_encrypted_supabase IS NOT NULL 
      THEN convert_from(pgsodium.crypto_secretbox_open(v_encrypted_supabase), 'utf8')
      ELSE NULL 
    END AS supabase_api_key,
    CASE WHEN v_encrypted_github IS NOT NULL 
      THEN convert_from(pgsodium.crypto_secretbox_open(v_encrypted_github), 'utf8')
      ELSE NULL 
    END AS github_pat;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;