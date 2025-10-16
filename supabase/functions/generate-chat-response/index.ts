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

    // PASSO 1: Salvar a mensagem do usuário no banco
    const { error: insertUserMsgError } = await supabaseAdmin
      .from("chat_messages")
      .insert({
        project_id: projectId,
        user_id: user.id,
        role: "user",
        content: message,
      });

    if (insertUserMsgError) {
      console.error("Error saving user message:", insertUserMsgError);
      throw new Error("Failed to save user message");
    }

    console.log("User message saved to database");

    // PASSO 2: Buscar todo o histórico de mensagens
    const { data: chatHistory, error: historyError } = await supabaseAdmin
      .from("chat_messages")
      .select("role, content")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true });

    if (historyError) {
      console.error("Error fetching chat history:", historyError);
      throw new Error("Failed to fetch chat history");
    }

    console.log(`Loaded ${chatHistory?.length || 0} messages from history`);

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

    // STEP 1: Analyze user intent and determine if tools are needed
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Analyze if we need to use tools
    const toolAnalysisPrompt = `You are an AI assistant that determines if a user's message requires accessing external tools.

Available tools:
- list_github_files: Lists files in the user's GitHub repository
- get_supabase_schema: Gets the database schema from the user's Supabase project

Analyze this user message and determine if any tools are needed. If tools are needed, respond with JSON format:
{"tool": "tool_name", "reason": "why this tool is needed"}

If no tools are needed, respond with:
{"tool": "none", "reason": "can answer directly"}

User message: "${message}"`;

    const analysisResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: toolAnalysisPrompt }],
        stream: false,
      }),
    });

    if (!analysisResp.ok) {
      console.error("Tool analysis failed:", await analysisResp.text());
      throw new Error("Failed to analyze user intent");
    }

    const analysisData = await analysisResp.json();
    const analysisContent = analysisData.choices[0].message.content;
    console.log("Tool analysis result:", analysisContent);

    let toolResult = null;
    let toolUsed = "none";
    
    try {
      const analysis = JSON.parse(analysisContent);
      
      if (analysis.tool !== "none") {
        console.log(`Invoking tool: ${analysis.tool}`);
        toolUsed = analysis.tool;
        
        // Invoke the appropriate tool
        if (analysis.tool === "list_github_files") {
          const toolResp = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/tool-list-github-files`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ projectId }),
          });
          
          toolResult = await toolResp.json();
          console.log("GitHub files tool result:", toolResult);
        } else if (analysis.tool === "get_supabase_schema") {
          const toolResp = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/tool-get-supabase-schema`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ projectId }),
          });
          
          toolResult = await toolResp.json();
          console.log("Supabase schema tool result:", toolResult);
        }
      }
    } catch (e) {
      console.error("Error parsing tool analysis or invoking tool:", e);
      // Continue without tool result
    }

    // Build system prompt with tool results
    let systemPrompt = userProfile?.system_instruction || 
      "You are a helpful AI assistant. Keep answers clear and concise.";

    if (toolResult && toolResult.success) {
      systemPrompt += `

## TOOL RESULT (${toolUsed})

`;
      
      if (toolUsed === "list_github_files" && toolResult.files) {
        systemPrompt += `Repository: ${toolResult.repository}
Total files: ${toolResult.totalFiles}

Files:
${toolResult.files.slice(0, 100).map((f: any) => `- ${f.path}`).join('\n')}

Use this information to answer the user's question about their GitHub repository.
`;
      } else if (toolUsed === "get_supabase_schema" && toolResult.schema) {
        systemPrompt += `Database Project: ${toolResult.projectUrl}
Total tables: ${toolResult.totalTables}

Schema:
${toolResult.schema.map((t: any) => `
Table: ${t.tableName}
Columns:
${t.columns.map((c: any) => `  - ${c.name} (${c.type})${c.nullable ? ' NULL' : ' NOT NULL'}${c.default ? ` DEFAULT ${c.default}` : ''}`).join('\n')}
`).join('\n')}

Use this schema information to answer the user's question about their database.
`;
      }
    } else if (toolResult && !toolResult.success) {
      systemPrompt += `

## TOOL ERROR

The requested tool (${toolUsed}) encountered an error: ${toolResult.error}

Please inform the user that the integration is not configured or there was an error accessing the data.
`;
    }

    // PASSO 3: Montar o array de mensagens com o histórico completo
    const messagesForAI = [
      { role: "system", content: systemPrompt },
      ...(chatHistory || []).map((msg: any) => ({
        role: msg.role === "user" ? "user" : "assistant",
        content: msg.content,
      })),
    ];

    console.log(`Calling Lovable AI Gateway with ${messagesForAI.length} messages`);

    // PASSO 4: Call Lovable AI Gateway
    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: messagesForAI,
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
        let accumulatedResponse = ""; // Para salvar no banco depois
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
                // PASSO 5: Salvar a resposta completa da IA no banco
                if (accumulatedResponse.trim()) {
                  await supabaseAdmin
                    .from("chat_messages")
                    .insert({
                      project_id: projectId,
                      user_id: user.id,
                      role: "ai",
                      content: accumulatedResponse,
                    });
                  console.log("AI response saved to database");
                }
                controller.close();
                return;
              }

              try {
                const event = JSON.parse(jsonStr);
                const chunk = event.choices?.[0]?.delta?.content;
                
                if (typeof chunk === "string" && chunk.length > 0) {
                  accumulatedResponse += chunk;
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
          
          // Salvar resposta se ainda não foi salva (fallback)
          if (accumulatedResponse.trim()) {
            await supabaseAdmin
              .from("chat_messages")
              .insert({
                project_id: projectId,
                user_id: user.id,
                role: "ai",
                content: accumulatedResponse,
              });
            console.log("AI response saved to database (final flush)");
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
