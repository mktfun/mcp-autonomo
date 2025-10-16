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

    // STEP 1: ANÁLISE DE INTENÇÃO - Qual ferramenta usar?
    const toolAnalysisPrompt = `Você é um orquestrador de ferramentas. Dada a pergunta do usuário abaixo, decida se uma das seguintes ferramentas é necessária:

FERRAMENTAS DISPONÍVEIS:
- list_github_files: Lista todos os arquivos no repositório GitHub do usuário. Use quando o usuário perguntar sobre arquivos, estrutura do repositório, ou o que há no repo.
- get_supabase_schema: Obtém o schema do banco de dados Supabase do usuário, incluindo todas as tabelas e colunas. Use quando o usuário perguntar sobre banco de dados, tabelas, ou schema.

PERGUNTA DO USUÁRIO: "${message}"

Responda APENAS com um JSON válido no formato:
{"tool_to_use": "NOME_DA_FERRAMENTA"}

OU se nenhuma ferramenta for necessária:
{"tool_to_use": "none"}

Não adicione markdown, código fence ou explicações. APENAS o JSON.`;

    console.log("Step 1: Analyzing user intent");

    const analysisResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: toolAnalysisPrompt }],
        temperature: 0.1, // Low temperature for consistent JSON
      }),
    });

    if (!analysisResp.ok) {
      console.error("Analysis call failed:", await analysisResp.text());
      throw new Error("Failed to analyze user intent");
    }

    const analysisData = await analysisResp.json();
    let analysisContent = analysisData.choices[0].message.content;
    
    console.log("Raw analysis result:", analysisContent);

    // Clean up the response - remove markdown code blocks if present
    analysisContent = analysisContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    console.log("Cleaned analysis result:", analysisContent);

    // STEP 2: EXECUTAR FERRAMENTA (se necessário)
    let toolResult = null;
    let toolUsed = "none";
    
    try {
      const analysis = JSON.parse(analysisContent);
      toolUsed = analysis.tool_to_use;
      
      if (toolUsed !== "none") {
        console.log(`Step 2: Executing tool: ${toolUsed}`);

        try {
          if (toolUsed === "list_github_files") {
            const toolResp = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/tool-list-github-files`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ projectId }),
            });
            
            toolResult = await toolResp.json();
            console.log("GitHub tool executed, success:", toolResult.success);
          } else if (toolUsed === "get_supabase_schema") {
            const toolResp = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/tool-get-supabase-schema`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ projectId }),
            });
            
            toolResult = await toolResp.json();
            console.log("Supabase tool executed, success:", toolResult.success);
          }
        } catch (e) {
          console.error("Error executing tool:", e);
          const errorMessage = e instanceof Error ? e.message : String(e);
          toolResult = { success: false, error: errorMessage };
        }
      }
    } catch (e) {
      console.error("Error parsing tool analysis:", e);
      // If we can't parse the JSON, continue without tools
      toolUsed = "none";
    }

    // STEP 3: CONSTRUIR PROMPT PARA RESPOSTA FINAL
    let systemPrompt = userProfile?.system_instruction || 
      "You are a helpful AI assistant that helps users with their projects. Keep answers clear and concise.";

    // Add tool result to system prompt if available
    if (toolUsed !== "none" && toolResult) {
      if (toolResult.success) {
        systemPrompt += `\n\n## DADOS DA FERRAMENTA (${toolUsed})\n\n`;
        
        if (toolUsed === "list_github_files" && toolResult.files) {
          systemPrompt += `Repositório: ${toolResult.repository}\nTotal de arquivos: ${toolResult.totalFiles}\n\nArquivos (primeiros 100):\n${toolResult.files.slice(0, 100).map((f: any) => `- ${f.path}`).join('\n')}\n\nUse estas informações para responder à pergunta do usuário sobre o repositório GitHub.`;
        } else if (toolUsed === "get_supabase_schema" && toolResult.schema) {
          systemPrompt += `Banco de dados: ${toolResult.projectUrl}\nTotal de tabelas: ${toolResult.totalTables}\n\nSchema:\n${toolResult.schema.map((t: any) => `Tabela: ${t.tableName}\nColunas:\n${t.columns.map((c: any) => `  - ${c.name} (${c.type})${c.nullable ? ' NULL' : ' NOT NULL'}`).join('\n')}`).join('\n\n')}\n\nUse estas informações do schema para responder à pergunta do usuário sobre o banco de dados.`;
        }
      } else {
        systemPrompt += `\n\n## ERRO DA FERRAMENTA\n\nA ferramenta ${toolUsed} retornou erro: ${toolResult.error}\n\nInforme ao usuário que a integração não está configurada ou houve um erro ao acessar os dados.`;
      }
    }

    // STEP 4: MONTAR MENSAGENS PARA RESPOSTA FINAL
    const messagesForResponse = [
      { role: "system", content: systemPrompt },
      ...(chatHistory || []).map((msg: any) => ({
        role: msg.role === "user" ? "user" : "assistant",
        content: msg.content,
      }))
    ];

    console.log(`Step 3: Generating final response with ${messagesForResponse.length} messages, tool used: ${toolUsed}`);

    // STEP 5: CHAMADA FINAL PARA GERAR RESPOSTA
    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: messagesForResponse,
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
