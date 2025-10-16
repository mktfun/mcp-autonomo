import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RequestBody {
  projectId: string;
  supabaseApiKey?: string;
  githubPat?: string;
  supabaseProjectUrl?: string;
  githubRepoOwner?: string;
  githubRepoName?: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get the authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    // Extract token from Authorization header
    const token = authHeader.replace('Bearer ', '');

    // Create Supabase Admin client with SERVICE_ROLE_KEY
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: { persistSession: false },
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    // Get the authenticated user using the token
    const {
      data: { user },
      error: userError,
    } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      console.error('Auth error:', userError);
      throw new Error('Unauthorized');
    }

    console.log('User authenticated:', user.id);

    // Parse request body
    const body: RequestBody = await req.json();
    const { 
      projectId, 
      supabaseApiKey, 
      githubPat,
      supabaseProjectUrl,
      githubRepoOwner,
      githubRepoName
    } = body;

    if (!projectId) {
      throw new Error('Project ID is required');
    }

    console.log('Updating project secrets for:', projectId);

    // First, update non-sensitive fields directly
    if (supabaseProjectUrl || githubRepoOwner || githubRepoName) {
      const updateData: any = {};
      if (supabaseProjectUrl) updateData.supabase_project_url = supabaseProjectUrl;
      if (githubRepoOwner) updateData.github_repo_owner = githubRepoOwner;
      if (githubRepoName) updateData.github_repo_name = githubRepoName;

      const { error: updateError } = await supabaseAdmin
        .from('projects')
        .update(updateData)
        .eq('id', projectId)
        .eq('user_id', user.id);

      if (updateError) {
        console.error('Error updating project fields:', updateError);
        throw updateError;
      }
    }

    // Then, save sensitive fields to Vault using the database function
    if (supabaseApiKey || githubPat) {
      const { error: rpcError } = await supabaseAdmin
        .rpc('update_project_secrets_in_vault', {
          p_project_id: projectId,
          p_supabase_api_key: supabaseApiKey || null,
          p_github_pat: githubPat || null,
        });

      if (rpcError) {
        console.error('Error saving secrets to Vault:', rpcError);
        throw rpcError;
      }

      console.log('Secrets saved to Vault successfully');
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Project settings updated securely',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Error in update-project-secrets function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({
        error: errorMessage,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
