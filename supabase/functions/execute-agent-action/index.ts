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
      // Execute SQL on the project database
      const sqlCode = action.payload.sql_code;
      
      if (!sqlCode) {
        throw new Error("No SQL code in payload");
      }

      console.log("Executing SQL:", sqlCode);

      try {
        // Execute directly on this Supabase project's database
        // Parse and execute the SQL using the admin client
        const { data, error } = await supabaseAdmin.rpc('exec_sql', {
          sql: sqlCode
        });

        if (error) {
          console.error("SQL execution error:", error);
          executionResult = {
            success: false,
            error: error.message || "Falha ao executar SQL"
          };
        } else {
          console.log("SQL executed successfully:", data);
          executionResult = {
            success: true,
            result: data,
            message: "SQL executado com sucesso!"
          };
        }
      } catch (e) {
        console.error("SQL execution exception:", e);
        executionResult = {
          success: false,
          error: e instanceof Error ? e.message : String(e)
        };
      }
    } else if (action.action_type === "propose_github_edit") {
      // Execute GitHub file edit
      const { file_path, changes_description } = action.payload;
      
      console.log("GitHub edit:", file_path, changes_description);

      try {
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

        const owner = project.github_repo_owner;
        const repo = project.github_repo_name;
        const githubPat = credentials[0].github_pat;

        console.log(`Editing file: ${owner}/${repo}/${file_path}`);

        // STEP 1: Read current file content
        const getFileUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${file_path}`;
        const getFileResponse = await fetch(getFileUrl, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${githubPat}`,
            Accept: "application/vnd.github.v3+json",
            "User-Agent": "Supabase-Edge-Function",
          },
        });

        if (!getFileResponse.ok) {
          const errorText = await getFileResponse.text();
          throw new Error(`Failed to read file from GitHub: ${errorText}`);
        }

        const fileData = await getFileResponse.json();
        const currentContent = atob(fileData.content); // Decode base64
        const fileSha = fileData.sha;

        console.log("Current file content length:", currentContent.length);

        // STEP 2: Generate new content using AI
        const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
        if (!LOVABLE_API_KEY) {
          throw new Error("LOVABLE_API_KEY not configured");
        }

        const editPrompt = `Aqui está o conteúdo atual do arquivo '${file_path}':\n\n\`\`\`\n${currentContent}\n\`\`\`\n\nAplique a seguinte mudança: '${changes_description}'.\n\nRetorne APENAS o conteúdo completo do arquivo modificado, sem nenhuma outra explicação, sem blocos de código markdown, apenas o conteúdo puro do arquivo.`;

        const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              { 
                role: "system", 
                content: "Você é um editor de código especializado. Retorne APENAS o código modificado, sem explicações, sem markdown." 
              },
              { role: "user", content: editPrompt }
            ],
            temperature: 0.2,
          }),
        });

        if (!aiResponse.ok) {
          throw new Error("Failed to generate new file content with AI");
        }

        const aiData = await aiResponse.json();
        let newContent = aiData.choices[0].message.content.trim();
        
        // Remove markdown code blocks if AI added them despite instructions
        newContent = newContent.replace(/^```[\w]*\n/g, '').replace(/\n```$/g, '');

        console.log("New file content length:", newContent.length);

        // STEP 3: Write the modified file back to GitHub
        const updateFileUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${file_path}`;
        const updateFileResponse = await fetch(updateFileUrl, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${githubPat}`,
            Accept: "application/vnd.github.v3+json",
            "User-Agent": "Supabase-Edge-Function",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: `Automated edit by AI Agent: ${changes_description}`,
            content: btoa(newContent), // Encode to base64
            sha: fileSha,
          }),
        });

        if (!updateFileResponse.ok) {
          const errorText = await updateFileResponse.text();
          throw new Error(`Failed to commit file to GitHub: ${errorText}`);
        }

        const commitData = await updateFileResponse.json();
        console.log("File committed successfully:", commitData.commit.sha);

        executionResult = {
          success: true,
          result: {
            commit_sha: commitData.commit.sha,
            commit_url: commitData.commit.html_url,
          },
          message: `Arquivo '${file_path}' editado com sucesso! Commit: ${commitData.commit.sha}`,
        };
      } catch (e) {
        console.error("GitHub edit error:", e);
        executionResult = {
          success: false,
          error: e instanceof Error ? e.message : String(e),
        };
      }
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
