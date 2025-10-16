-- Remove old function
DROP FUNCTION IF EXISTS public.update_project_encrypted_secrets(uuid, text, text);

-- Create new function that saves to Vault (similar to user pattern)
CREATE OR REPLACE FUNCTION public.update_project_secrets_in_vault(
  p_project_id UUID,
  p_supabase_api_key TEXT DEFAULT NULL,
  p_github_pat TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  secret_name_supabase TEXT;
  secret_name_github TEXT;
BEGIN
  -- Verify user owns the project
  IF NOT EXISTS (
    SELECT 1 FROM public.projects 
    WHERE id = p_project_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Unauthorized: You do not own this project';
  END IF;
  
  -- Save Supabase API Key to Vault
  IF p_supabase_api_key IS NOT NULL AND p_supabase_api_key != '' THEN
    secret_name_supabase := 'project_supabase_' || p_project_id::text;
    DELETE FROM vault.secrets WHERE name = secret_name_supabase;
    PERFORM vault.create_secret(
      p_supabase_api_key,
      secret_name_supabase,
      'Supabase API key for project ' || p_project_id::text
    );
  END IF;
  
  -- Save GitHub PAT to Vault
  IF p_github_pat IS NOT NULL AND p_github_pat != '' THEN
    secret_name_github := 'project_github_' || p_project_id::text;
    DELETE FROM vault.secrets WHERE name = secret_name_github;
    PERFORM vault.create_secret(
      p_github_pat,
      secret_name_github,
      'GitHub PAT for project ' || p_project_id::text
    );
  END IF;
END;
$$;

-- Update decryption function to read from Vault
CREATE OR REPLACE FUNCTION public.decrypt_project_credentials(p_project_id UUID)
RETURNS TABLE(supabase_api_key TEXT, github_pat TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  secret_name_supabase TEXT;
  secret_name_github TEXT;
BEGIN
  -- Verify ownership
  IF NOT EXISTS (
    SELECT 1 FROM public.projects 
    WHERE id = p_project_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Project not found or unauthorized';
  END IF;
  
  secret_name_supabase := 'project_supabase_' || p_project_id::text;
  secret_name_github := 'project_github_' || p_project_id::text;
  
  RETURN QUERY SELECT
    (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = secret_name_supabase) AS supabase_api_key,
    (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = secret_name_github) AS github_pat;
END;
$$;