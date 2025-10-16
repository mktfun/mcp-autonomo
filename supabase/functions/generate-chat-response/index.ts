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
      .select("ai_model, system_instruction, temperature")
      .eq("id", user.id)
      .single();

    if (profileError) {
      throw new Error("Failed to fetch user profile: " + profileError.message);
    }

    console.log("User profile fetched:", userProfile.ai_model);

    // Fetch API key from Vault (Phase 2: Fixed approach)
    const secretName = `gemini_api_key_${user.id}`;
    const { data: vaultSecrets, error: vaultError } = await supabaseAdmin
      .from("vault.decrypted_secrets")
      .select("decrypted_secret")
      .eq("name", secretName)
      .maybeSingle();

    if (vaultError) {
      console.error("Vault error:", vaultError);
      throw new Error("Failed to fetch API key from Vault");
    }

    if (!vaultSecrets?.decrypted_secret) {
      throw new Error("API key não configurada. Por favor, adicione sua Gemini API key nas Configurações.");
    }

    const apiKey = vaultSecrets.decrypted_secret;
    console.log("API key fetched from Vault successfully");

    // Phase 4: Fetch project details for contextualization
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

    // Phase 4: Build the full prompt with context injection
    let fullPrompt = "";
    
    if (userProfile.system_instruction) {
      fullPrompt += `${userProfile.system_instruction}\n\n`;
    }
    
    if (supabaseContext || githubContext) {
      fullPrompt += `## PROJECT CONTEXT\n\n`;
      if (supabaseContext) fullPrompt += `${supabaseContext}\n`;
      if (githubContext) fullPrompt += `${githubContext}\n`;
      fullPrompt += `---\n\n`;
    }
    
    fullPrompt += `User: ${message}\nAssistant:`;

    console.log("Calling Gemini API with model:", userProfile.ai_model);

    // Call Gemini API with streaming
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${userProfile.ai_model}:streamGenerateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: fullPrompt,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: userProfile.temperature || 0.7,
            maxOutputTokens: 2048,
          },
        }),
      }
    );

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error("Gemini API error:", errorText);
      throw new Error(`Gemini API error: ${errorText}`);
    }

    console.log("Gemini API response received, starting stream");

    // Create a readable stream from the Gemini response
    const reader = geminiResponse.body?.getReader();
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    if (!reader) {
      throw new Error("Failed to get response reader");
    }

    const stream = new ReadableStream({
      async start(controller) {
        try {
          while (true) {
            const { done, value } = await reader.read();
            
            if (done) {
              controller.close();
              break;
            }

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split("\n").filter(line => line.trim());
            
            for (const line of lines) {
              try {
                const json = JSON.parse(line);
                
                if (json.candidates && json.candidates[0]?.content?.parts) {
                  const text = json.candidates[0].content.parts[0]?.text || "";
                  
                  if (text) {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
                  }
                }
              } catch (e) {
                console.log("Skipping invalid JSON:", line);
              }
            }
          }
        } catch (error) {
          console.error("Stream error:", error);
          controller.error(error);
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
