-- Enable pgsodium extension for encryption
CREATE EXTENSION IF NOT EXISTS pgsodium;

-- Create a function to securely update project secrets
-- This function will be called from the Edge Function
CREATE OR REPLACE FUNCTION public.update_project_encrypted_secrets(
  p_project_id uuid,
  p_supabase_api_key text DEFAULT NULL,
  p_github_pat text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_encrypted_supabase bytea;
  v_encrypted_github bytea;
BEGIN
  -- Get the user_id of the authenticated user
  v_user_id := auth.uid();
  
  -- Check if the user owns this project
  IF NOT EXISTS (
    SELECT 1 FROM public.projects 
    WHERE id = p_project_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Unauthorized: You do not own this project';
  END IF;
  
  -- Encrypt the secrets if provided
  IF p_supabase_api_key IS NOT NULL THEN
    v_encrypted_supabase := pgsodium.crypto_secretbox_noncegen(
      p_supabase_api_key::bytea
    );
  END IF;
  
  IF p_github_pat IS NOT NULL THEN
    v_encrypted_github := pgsodium.crypto_secretbox_noncegen(
      p_github_pat::bytea
    );
  END IF;
  
  -- Update the project with encrypted values
  UPDATE public.projects
  SET
    encrypted_supabase_api_key = COALESCE(v_encrypted_supabase, encrypted_supabase_api_key),
    encrypted_github_pat = COALESCE(v_encrypted_github, encrypted_github_pat)
  WHERE id = p_project_id AND user_id = v_user_id;
  
  RETURN json_build_object(
    'success', true,
    'message', 'Secrets updated successfully'
  );
END;
$$;