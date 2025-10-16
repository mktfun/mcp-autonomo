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

    // Get Lovable API key
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // ========== CHAMADA 1: O ROTEADOR ==========
    const routerSystemPrompt = `Você é um roteador de tarefas. Sua única função é analisar a mensagem do usuário e decidir se uma das seguintes ferramentas é necessária: list_github_files ou get_supabase_schema. Responda APENAS com um JSON válido no formato {"tool_to_use": "NOME_DA_FERRAMENTA"} ou {"tool_to_use": "none"}. Não adicione nenhum outro texto.`;

    const routerPrompt = `Analise esta mensagem do usuário e decida qual ferramenta usar:

MENSAGEM DO USUÁRIO: "${message}"

FERRAMENTAS DISPONÍVEIS:
- list_github_files: Use quando o usuário perguntar sobre arquivos, repositório, código, estrutura de pastas, ou o que há no GitHub
- get_supabase_schema: Use quando o usuário perguntar sobre banco de dados, tabelas, schema, colunas, ou estrutura de dados

Responda APENAS com o JSON.`;

    console.log("========== STEP 1: ROUTER CALL ==========");
    console.log("User message:", message);

    const routerResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: routerSystemPrompt },
          { role: "user", content: routerPrompt }
        ],
        temperature: 0.1,
      }),
    });

    if (!routerResp.ok) {
      const errorText = await routerResp.text();
      console.error("Router call failed:", errorText);
      throw new Error("Failed to route user intent");
    }

    const routerData = await routerResp.json();
    let routerContent = routerData.choices[0].message.content;
    
    console.log("Raw router response:", routerContent);

    // Clean up the response - remove markdown, extra spaces, etc
    routerContent = routerContent
      .replace(/```json\s*/g, '')
      .replace(/```\s*/g, '')
      .replace(/^\s+|\s+$/g, '')
      .trim();
    
    console.log("Cleaned router response:", routerContent);

    // ========== LÓGICA DE ORQUESTRAÇÃO: EXECUTAR FERRAMENTA ==========
    let toolResult = null;
    let toolUsed = "none";
    let rawToolData = null;
    
    try {
      const routerDecision = JSON.parse(routerContent);
      toolUsed = routerDecision.tool_to_use;
      
      console.log("========== STEP 2: TOOL EXECUTION ==========");
      console.log("Tool to use:", toolUsed);
      
      if (toolUsed !== "none") {
        try {
          let toolUrl = "";
          
          if (toolUsed === "list_github_files") {
            toolUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/tool-list-github-files`;
          } else if (toolUsed === "get_supabase_schema") {
            toolUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/tool-get-supabase-schema`;
          }
          
          if (toolUrl) {
            const toolResp = await fetch(toolUrl, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ projectId }),
            });
            
            rawToolData = await toolResp.json();
            console.log(`Tool ${toolUsed} executed, success:`, rawToolData.success);
            
            if (rawToolData.success) {
              console.log("Tool result summary:", {
                tool: toolUsed,
                hasData: !!rawToolData.files || !!rawToolData.schema,
                fileCount: rawToolData.files?.length,
                tableCount: rawToolData.schema?.length
              });
            } else {
              console.error("Tool returned error:", rawToolData.error);
            }
          }
        } catch (e) {
          console.error("Error executing tool:", e);
          const errorMessage = e instanceof Error ? e.message : String(e);
          rawToolData = { success: false, error: errorMessage };
        }
      } else {
        console.log("No tool needed, proceeding without tool data");
      }
    } catch (e) {
      console.error("Error parsing router response:", e);
      console.log("Will proceed without tools");
      toolUsed = "none";
    }

    // ========== CHAMADA 2: O TRADUTOR ==========
    console.log("========== STEP 3: TRANSLATOR CALL ==========");
    
    // Build the translator system prompt
    let translatorSystemPrompt = userProfile?.system_instruction || 
      "Você é um assistente de desenvolvimento prestativo. Responda de forma clara e concisa.";

    // If we have tool data, add it to the system prompt
    if (toolUsed !== "none" && rawToolData) {
      translatorSystemPrompt += `\n\n---\nDADOS DA FERRAMENTA (${toolUsed}):\n`;
      translatorSystemPrompt += JSON.stringify(rawToolData, null, 2);
      translatorSystemPrompt += `\n---\n\nUse os dados brutos da ferramenta acima para formular uma resposta completa e amigável para o usuário.`;
      
      if (!rawToolData.success) {
        translatorSystemPrompt += `\n\nIMPORTANTE: A ferramenta retornou erro. Informe ao usuário que a integração não está configurada ou que você não tem acesso aos dados.`;
      }
    }

    // Build messages for the translator
    const translatorMessages = [
      { role: "system", content: translatorSystemPrompt },
      ...(chatHistory || []).map((msg: any) => ({
        role: msg.role === "user" ? "user" : "assistant",
        content: msg.content,
      }))
    ];

    console.log("Translator system prompt preview:", translatorSystemPrompt.substring(0, 200) + "...");
    console.log("Total messages for translator:", translatorMessages.length);

    // STEP 4: FINAL AI CALL
    const finalResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: translatorMessages,
        stream: true,
        temperature: userProfile?.temperature ?? 0.7,
      }),
    });

    if (!finalResp.ok) {
      if (finalResp.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limits exceeded, please try again later." }),
          {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      if (finalResp.status === 402) {
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
      const errorText = await finalResp.text();
      console.error("Final AI call error:", finalResp.status, errorText);
      return new Response(
        JSON.stringify({ error: "AI gateway error" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Stream the response
    const reader = finalResp.body?.getReader();
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    if (!reader) {
      throw new Error("Failed to start stream");
    }

    const stream = new ReadableStream({
      async start(controller) {
        let buffer = "";
        let accumulatedResponse = "";
        
        // Send tool status event if a tool was used
        if (toolUsed !== "none") {
          const toolStatusMessage = toolUsed === "list_github_files" 
            ? "Acessando GitHub..." 
            : "Consultando Supabase...";
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ status: "tool", tool: toolUsed, message: toolStatusMessage })}\n\n`)
          );
        }
        
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
