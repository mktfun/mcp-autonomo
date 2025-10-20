import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { actionId } = await req.json();

    if (!actionId) {
      throw new Error("actionId is required");
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

    console.log("User authenticated:", user.id);
    console.log("Action ID:", actionId);

    // Get the action and verify ownership
    const { data: action, error: actionError } = await supabaseAdmin
      .from("agent_actions")
      .select(`
        *,
        projects!inner(user_id)
      `)
      .eq("id", actionId)
      .single();

    if (actionError) {
      console.error("Error fetching action:", actionError);
      throw new Error("Action not found");
    }

    // Security check: verify user owns the project
    if (action.projects.user_id !== user.id) {
      console.error("Unauthorized: user does not own this project");
      throw new Error("Unauthorized: you do not own this action");
    }

    // Check if action is still pending
    if (action.status !== "pending") {
      throw new Error(`Action is not pending (current status: ${action.status})`);
    }

    console.log("Action type:", action.action_type);
    console.log("Action payload:", action.payload);

    let executionResult: any = { success: false };

    // Execute based on action type
    if (action.action_type === "propose_sql_execution") {
      // Execute SQL on the user's project database
      const sqlCode = action.payload.sql_code;
      
      if (!sqlCode) {
        throw new Error("No SQL code in payload");
      }

      console.log("SQL to execute:", sqlCode);

      // For now, we'll return the SQL for manual execution
      // In the future, this could execute directly on the user's Supabase project
      // with proper validation and security measures
      
      executionResult = {
        success: true,
        result: {
          message: "SQL gerado com sucesso. Por questões de segurança, execute manualmente em seu projeto Supabase.",
          sql: sqlCode
        },
        message: `SQL pronto para execução:\n\n${sqlCode}\n\nPor favor, execute este código manualmente no SQL Editor do seu projeto Supabase para garantir segurança.`
      };
      
      /* TODO: Implementar execução automática segura
      // Get project credentials from vault
      const { data: credentials } = await supabaseAdmin.rpc(
        "decrypt_project_credentials",
        { p_project_id: action.project_id }
      );

      if (!credentials || !credentials[0]?.supabase_api_key) {
        throw new Error("Project Supabase credentials not found");
      }

      // Get project URL
      const { data: project } = await supabaseAdmin
        .from("projects")
        .select("supabase_project_url")
        .eq("id", action.project_id)
        .single();

      if (!project?.supabase_project_url) {
        throw new Error("Project Supabase URL not found");
      }

      // Execute SQL safely with proper validation
      */
    } else if (action.action_type === "propose_github_edit") {
      // Execute GitHub edit
      const { file_path, changes_description } = action.payload;
      
      console.log("GitHub edit:", file_path, changes_description);

      // Get GitHub credentials
      const { data: credentials } = await supabaseAdmin.rpc(
        "decrypt_project_credentials",
        { p_project_id: action.project_id }
      );

      if (!credentials || !credentials[0]?.github_pat) {
        throw new Error("GitHub credentials not found");
      }

      // Get project GitHub info
      const { data: project } = await supabaseAdmin
        .from("projects")
        .select("github_repo_owner, github_repo_name")
        .eq("id", action.project_id)
        .single();

      if (!project?.github_repo_owner || !project?.github_repo_name) {
        throw new Error("GitHub repository not configured");
      }

      // TODO: Implement GitHub API call to edit file
      // This would involve:
      // 1. Getting the current file content
      // 2. Applying the changes
      // 3. Creating a commit
      
      executionResult = {
        success: false,
        error: "GitHub edit not yet implemented"
      };
    } else {
      throw new Error(`Unknown action type: ${action.action_type}`);
    }

    // Update action status
    const newStatus = executionResult.success ? "executed" : "failed";
    
    await supabaseAdmin
      .from("agent_actions")
      .update({
        status: newStatus,
        executed_at: new Date().toISOString(),
      })
      .eq("id", actionId);

    console.log("Action status updated to:", newStatus);

    return new Response(
      JSON.stringify({
        success: executionResult.success,
        result: executionResult.result,
        message: executionResult.message,
        error: executionResult.error,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error in execute-agent-action:", error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
