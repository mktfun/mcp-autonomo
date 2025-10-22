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
    const { projectId, content } = await req.json();

    if (!projectId || !content) {
      throw new Error("projectId and content are required");
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

    console.log("Adding memory for user:", user.id, "project:", projectId);

    // Verify user owns the project
    const { data: project, error: projectError } = await supabaseAdmin
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .eq("user_id", user.id)
      .single();

    if (projectError || !project) {
      throw new Error("Project not found or unauthorized");
    }

    // Create memory entry
    const { data: memoryEntry, error: memoryError } = await supabaseAdmin
      .from("memory_entries")
      .insert({
        project_id: projectId,
        user_id: user.id,
        content,
      })
      .select()
      .single();

    if (memoryError) {
      throw new Error(`Failed to create memory entry: ${memoryError.message}`);
    }

    console.log("Memory entry created successfully:", memoryEntry.id);

    const output = {
      success: true,
      data: {
        memoryId: memoryEntry.id,
        content: memoryEntry.content,
        timestamp: memoryEntry.timestamp,
      }
    };

    // Log successful execution
    await logToolExecution(
      supabaseAdmin,
      user.id,
      projectId,
      'add-memory',
      { projectId, content },
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
    console.error("Error in add-memory:", error);
    
    // Try to log error execution if we have the necessary data
    try {
      const { projectId, content } = await req.json().catch(() => ({}));
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
            'add-memory',
            { projectId, content },
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
