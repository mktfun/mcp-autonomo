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
    const { projectId, message } = await req.json();

    if (!projectId || !message) {
      throw new Error("projectId and message are required");
    }

    // Initialize Supabase Admin client for Vault access
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

    // Fetch user's AI configuration
    const { data: userProfile, error: profileError } = await supabaseAdmin
      .from("user_profiles")
      .select("system_instruction, temperature")
      .eq("id", user.id)
      .single();

    if (profileError) {
      throw new Error("Failed to fetch user profile: " + profileError.message);
    }

    console.log("User profile fetched");

    // Fetch project details for contextualization
    const { data: project, error: projectError } = await supabaseAdmin
      .from("projects")
      .select("supabase_project_url, github_repo_owner, github_repo_name")
      .eq("id", projectId)
      .eq("user_id", user.id)
      .single();

    if (projectError) {
      console.error("Project fetch error:", projectError);
      throw new Error("Failed to fetch project details");
    }

    console.log("Project fetched:", project);

    // Phase 4: Fetch and decrypt project credentials
    let supabaseContext = "";
    let githubContext = "";

    try {
      const { data: projectCreds, error: credsError } = await supabaseAdmin.rpc('decrypt_project_credentials', {
        p_project_id: projectId
      });

      if (credsError) {
        console.error("Failed to decrypt project credentials:", credsError);
      } else if (projectCreds && projectCreds.length > 0) {
        const creds = projectCreds[0];

        // Fetch Supabase schema context if configured
        if (creds.supabase_api_key && project.supabase_project_url) {
          console.log("Fetching Supabase context...");
          try {
            const projectSupabase = createClient(
              project.supabase_project_url,
              creds.supabase_api_key
            );
            
            const { data: tables, error: tablesError } = await projectSupabase
              .from('information_schema.tables')
              .select('table_name')
              .eq('table_schema', 'public');
            
            if (!tablesError && tables && tables.length > 0) {
              supabaseContext = `### Database Schema (Supabase)\nTables:\n${tables.map(t => `- ${t.table_name}`).join('\n')}\n`;
              console.log("Supabase context fetched:", tables.length, "tables");
            }
          } catch (e) {
            console.error("Error fetching Supabase context:", e);
          }
        }

        // Fetch GitHub repository structure if configured
        if (creds.github_pat && project.github_repo_owner && project.github_repo_name) {
          console.log("Fetching GitHub context...");
          try {
            const ghResponse = await fetch(
              `https://api.github.com/repos/${project.github_repo_owner}/${project.github_repo_name}/git/trees/main?recursive=1`,
              {
                headers: {
                  'Authorization': `token ${creds.github_pat}`,
                  'Accept': 'application/vnd.github.v3+json',
                  'User-Agent': 'Supabase-Edge-Function'
                }
              }
            );
            
            if (ghResponse.ok) {
              const { tree } = await ghResponse.json();
              const files = tree
                .filter((item: any) => item.type === 'blob')
                .map((item: any) => item.path)
                .slice(0, 100); // Limit to first 100 files
              
              githubContext = `### Repository Structure (GitHub)\nFiles (showing first 100):\n${files.join('\n')}\n`;
              console.log("GitHub context fetched:", files.length, "files");
            } else {
              console.error("GitHub API error:", ghResponse.status, await ghResponse.text());
            }
          } catch (e) {
            console.error("Error fetching GitHub context:", e);
          }
        }
      }
    } catch (e) {
      console.error("Error in contextualization phase:", e);
      // Continue without context if it fails
    }

    // Build system prompt with context
    let systemPrompt = userProfile?.system_instruction || 
      "You are a helpful AI assistant. Keep answers clear and concise.";

    if (supabaseContext || githubContext) {
      systemPrompt += `

## PROJECT CONTEXT

${supabaseContext || ""}

${githubContext || ""}

---
`;
    }

    // Get Lovable API key
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    console.log("Calling Lovable AI Gateway with model: google/gemini-2.5-flash");

    // Call Lovable AI Gateway
    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message },
        ],
        stream: true,
        temperature: userProfile?.temperature ?? 0.7,
      }),
    });

    if (!aiResp.ok) {
      if (aiResp.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limits exceeded, please try again later." }),
          {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      if (aiResp.status === 402) {
        return new Response(
          JSON.stringify({ 
            error: "Payment required, please add funds to your Lovable AI workspace." 
          }),
          {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      const errorText = await aiResp.text();
      console.error("AI gateway error:", aiResp.status, errorText);
      return new Response(
        JSON.stringify({ error: "AI gateway error" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Stream the response, converting OpenAI format to our format
    const reader = aiResp.body?.getReader();
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    if (!reader) {
      throw new Error("Failed to start stream");
    }

    const stream = new ReadableStream({
      async start(controller) {
        let buffer = "";
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            let newlineIndex;
            while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
              let line = buffer.slice(0, newlineIndex);
              buffer = buffer.slice(newlineIndex + 1);

              if (line.endsWith("\r")) line = line.slice(0, -1);
              if (!line || line.startsWith(":")) continue;
              if (!line.startsWith("data: ")) continue;

              const jsonStr = line.slice(6).trim();
              if (jsonStr === "[DONE]") {
                controller.close();
                return;
              }

              try {
                const event = JSON.parse(jsonStr);
                const chunk = event.choices?.[0]?.delta?.content;
                
                if (typeof chunk === "string" && chunk.length > 0) {
                  // Convert to our format: data: {"text": "..."}
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ text: chunk })}\n\n`)
                  );
                }
              } catch {
                // Partial JSON, put it back in the buffer
                buffer = line + "\n" + buffer;
                break;
              }
            }
          }
          controller.close();
        } catch (err) {
          console.error("Stream error:", err);
          controller.error(err);
        }
      },
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (error: any) {
    console.error("Error in generate-chat-response:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
