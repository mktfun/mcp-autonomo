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

    // Create Supabase client with the auth header
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    // Get the authenticated user
    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser();

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

      const { error: updateError } = await supabaseClient
        .from('projects')
        .update(updateData)
        .eq('id', projectId)
        .eq('user_id', user.id);

      if (updateError) {
        console.error('Error updating project fields:', updateError);
        throw updateError;
      }
    }

    // Then, encrypt and store sensitive fields using the database function
    if (supabaseApiKey || githubPat) {
      const { data: functionResult, error: functionError } = await supabaseClient
        .rpc('update_project_encrypted_secrets', {
          p_project_id: projectId,
          p_supabase_api_key: supabaseApiKey || null,
          p_github_pat: githubPat || null,
        });

      if (functionError) {
        console.error('Error encrypting secrets:', functionError);
        throw functionError;
      }

      console.log('Secrets encrypted successfully:', functionResult);
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
