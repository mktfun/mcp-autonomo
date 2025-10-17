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

    console.log("Fetching Supabase schema for user:", user.id, "project:", projectId);

    // Fetch project details
    const { data: project, error: projectError } = await supabaseAdmin
      .from("projects")
      .select("supabase_project_url")
      .eq("id", projectId)
      .eq("user_id", user.id)
      .single();

    if (projectError || !project) {
      throw new Error("Project not found or unauthorized");
    }

    if (!project.supabase_project_url) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Supabase integration not configured for this project" 
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Decrypt Supabase API key using authenticated context
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
      hasSupabaseKey: projectCreds?.[0]?.supabase_api_key ? 'yes' : 'no'
    });

    if (credsError || !projectCreds || projectCreds.length === 0 || !projectCreds[0].supabase_api_key) {
      console.error("Credentials error details:", credsError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Supabase credentials not found" 
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabaseApiKey = projectCreds[0].supabase_api_key;

    // Connect to user's Supabase project
    console.log(`Connecting to user's Supabase project: ${project.supabase_project_url}`);
    const projectSupabase = createClient(
      project.supabase_project_url,
      supabaseApiKey
    );

    // Fetch schema information - get basic table list
    const { data: tables, error: tablesError } = await projectSupabase
      .from('information_schema.tables')
      .select('table_name, table_schema')
      .eq('table_schema', 'public');

    if (tablesError) {
      console.error("Error fetching schema:", tablesError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Failed to fetch schema information" 
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Get detailed column information for each table
    const schema: any[] = [];
    
    if (tables && Array.isArray(tables)) {
      for (const table of tables.slice(0, 50)) { // Limit to 50 tables
        const tableName = table.table_name;
        
        try {
          const { data: columns, error: columnsError } = await projectSupabase
            .from('information_schema.columns')
            .select('column_name, data_type, is_nullable, column_default')
            .eq('table_schema', 'public')
            .eq('table_name', tableName);

          if (!columnsError && columns) {
            schema.push({
              tableName,
              columns: columns.map((col: any) => ({
                name: col.column_name,
                type: col.data_type,
                nullable: col.is_nullable === 'YES',
                default: col.column_default
              }))
            });
          }
        } catch (e) {
          console.error(`Error fetching columns for ${tableName}:`, e);
        }
      }
    }

    console.log(`Found ${schema.length} tables with detailed schema`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        schema,
        projectUrl: project.supabase_project_url,
        totalTables: schema.length
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error in tool-get-supabase-schema:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
