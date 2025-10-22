import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Helper function to log tool execution
async function logToolExecution(
  supabase: any,
  userId: string,
  projectId: string,
  toolName: string,
  toolInput: any,
  toolOutput: any,
  status: 'success' | 'error',
  errorMessage?: string
) {
  try {
    await supabase.from('agent_logs').insert({
      user_id: userId,
      project_id: projectId,
      tool_name: toolName,
      tool_input: toolInput,
      tool_output: toolOutput,
      status,
      error_message: errorMessage,
    });
  } catch (logError) {
    console.error('Failed to log tool execution:', logError);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { projectId } = await req.json();

    if (!projectId) {
      throw new Error("projectId is required");
    }

    // Initialize Supabase Admin client
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Get the authenticated user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");
    
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      throw new Error("Unauthorized");
    }

    console.log("Fetching GitHub files for user:", user.id, "project:", projectId);

    // Fetch project details
    const { data: project, error: projectError } = await supabaseAdmin
      .from("projects")
      .select("github_repo_owner, github_repo_name")
      .eq("id", projectId)
      .eq("user_id", user.id)
      .single();

    if (projectError || !project) {
      throw new Error("Project not found or unauthorized");
    }

    if (!project.github_repo_owner || !project.github_repo_name) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "GitHub integration not configured for this project" 
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Decrypt GitHub PAT using authenticated context
    const supabaseWithAuth = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    const { data: projectCreds, error: credsError } = await supabaseWithAuth.rpc('decrypt_project_credentials', {
      p_project_id: projectId
    });

    console.log("Decrypt credentials result:", { 
      hasError: !!credsError, 
      hasCreds: !!projectCreds, 
      credsLength: projectCreds?.length,
      hasGithubPat: projectCreds?.[0]?.github_pat ? 'yes' : 'no'
    });

    if (credsError || !projectCreds || projectCreds.length === 0 || !projectCreds[0].github_pat) {
      console.error("Credentials error details:", credsError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "GitHub credentials not found" 
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const githubPat = projectCreds[0].github_pat;

    // Fetch repository tree from GitHub
    console.log(`Fetching tree for ${project.github_repo_owner}/${project.github_repo_name}`);
    const ghResponse = await fetch(
      `https://api.github.com/repos/${project.github_repo_owner}/${project.github_repo_name}/git/trees/main?recursive=1`,
      {
        headers: {
          'Authorization': `token ${githubPat}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Supabase-Edge-Function'
        }
      }
    );

    if (!ghResponse.ok) {
      const errorText = await ghResponse.text();
      console.error("GitHub API error:", ghResponse.status, errorText);
      
      // Try to parse error message from GitHub response
      let errorMessage = `GitHub API error: ${ghResponse.status}`;
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.message) {
          errorMessage = errorJson.message;
        }
      } catch {
        // If not JSON, use the text directly if it's not too long
        if (errorText && errorText.length < 200) {
          errorMessage = errorText;
        }
      }
      
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: errorMessage 
        }),
        {
          status: ghResponse.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { tree } = await ghResponse.json();
    const files = tree
      .filter((item: any) => item.type === 'blob')
      .map((item: any) => ({
        path: item.path,
        size: item.size,
        sha: item.sha
      }));

    console.log(`Found ${files.length} files in repository`);

    const output = {
      success: true,
      data: {
        files,
        repository: `${project.github_repo_owner}/${project.github_repo_name}`,
        totalFiles: files.length
      }
    };

    // Log successful execution
    await logToolExecution(
      supabaseAdmin,
      user.id,
      projectId,
      'tool-list-github-files',
      { projectId },
      output,
      'success'
    );

    return new Response(
      JSON.stringify(output),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error in tool-list-github-files:", error);
    
    // Try to log error execution if we have the necessary data
    try {
      const { projectId } = await req.json().catch(() => ({}));
      const authHeader = req.headers.get("Authorization");
      
      if (projectId && authHeader) {
        const supabaseAdmin = createClient(
          Deno.env.get("SUPABASE_URL") ?? "",
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );
        const token = authHeader.replace("Bearer ", "");
        const { data: { user } } = await supabaseAdmin.auth.getUser(token);
        
        if (user) {
          await logToolExecution(
            supabaseAdmin,
            user.id,
            projectId,
            'tool-list-github-files',
            { projectId },
            { success: false, error: error.message },
            'error',
            error.message
          );
        }
      }
    } catch (logError) {
      console.error('Failed to log error:', logError);
    }

    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
