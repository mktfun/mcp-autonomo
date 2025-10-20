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
    const routerSystemPrompt = `Você é um parser de JSON. Sua única função é analisar a mensagem e decidir se uma das ferramentas é necessária. Você DEVE responder APENAS com um JSON válido. Nenhum outro texto, saudação ou explicação é permitido. O formato é {"tool_to_use": "NOME_DA_FERRAMENTA", "parameters": {...}} ou {"tool_to_use": "none"}. Para ferramentas que não precisam de parâmetros (list_github_files, get_supabase_schema), omita o campo parameters. Uma resposta fora deste formato é uma falha crítica.`;

    const routerPrompt = `Analise esta mensagem do usuário e decida qual ferramenta usar:

MENSAGEM DO USUÁRIO: "${message}"

FERRAMENTAS DISPONÍVEIS:
- list_github_files: Use quando o usuário perguntar sobre arquivos, repositório, código, estrutura de pastas, ou o que há no GitHub
- get_supabase_schema: Use quando o usuário perguntar sobre banco de dados, tabelas, schema, colunas, ou estrutura de dados
- web_search: Use quando o usuário perguntar sobre eventos atuais, notícias, informações do mundo real, ou conhecimento geral que não esteja no código ou banco de dados
- propose_sql_execution: Use quando o usuário pedir para EXECUTAR, RODAR, CRIAR, DELETAR, ATUALIZAR algo no banco de dados (ex: "delete todos os usuários", "crie uma tabela X", "atualize os registros"). Retorne {"tool_to_use": "propose_sql_execution", "parameters": {"sql_code": "O CÓDIGO SQL EXATO"}}
- propose_github_edit: Use quando o usuário pedir para EDITAR, MODIFICAR, CRIAR arquivos no GitHub (ex: "edite o arquivo X", "crie um componente Y"). Retorne {"tool_to_use": "propose_github_edit", "parameters": {"file_path": "caminho/do/arquivo", "changes_description": "descrição das mudanças"}}

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
    let toolParameters = null;
    
    try {
      const routerDecision = JSON.parse(routerContent);
      toolUsed = routerDecision.tool_to_use;
      toolParameters = routerDecision.parameters || null;
      
      console.log("========== STEP 2: TOOL EXECUTION ==========");
      console.log("Tool to use:", toolUsed);
      console.log("Tool parameters:", toolParameters);
      
      if (toolUsed !== "none") {
        // Check if it's a proposal tool
        if (toolUsed === "propose_sql_execution" || toolUsed === "propose_github_edit") {
          // Don't execute, just create the action record
          try {
            const { data: actionData, error: actionError } = await supabaseAdmin
              .from("agent_actions")
              .insert({
                project_id: projectId,
                action_type: toolUsed,
                payload: toolParameters,
                status: "pending"
              })
              .select()
              .single();
            
            if (actionError) {
              console.error("Error creating action:", actionError);
              rawToolData = { success: false, error: "Falha ao criar ação pendente" };
            } else {
              console.log("Action created:", actionData.id);
              rawToolData = { 
                success: true, 
                action_id: actionData.id,
                action_type: toolUsed,
                payload: toolParameters,
                isPendingAction: true
              };
            }
          } catch (e) {
            console.error("Error creating action:", e);
            rawToolData = { success: false, error: e instanceof Error ? e.message : String(e) };
          }
        } else {
          // Execute information-gathering tools normally
          try {
            let toolUrl = "";
            let toolBody: any = { projectId };
            
            if (toolUsed === "list_github_files") {
              toolUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/tool-list-github-files`;
            } else if (toolUsed === "get_supabase_schema") {
              toolUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/tool-get-supabase-schema`;
            } else if (toolUsed === "web_search") {
              toolUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/tool-web-search`;
              toolBody = { query: toolParameters?.query || message };
            }
            
            if (toolUrl) {
              const toolResp = await fetch(toolUrl, {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${token}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify(toolBody),
              });
              
              rawToolData = await toolResp.json();
              console.log(`Tool ${toolUsed} executed, success:`, rawToolData.success);
              
              if (rawToolData.success) {
                console.log("Tool result summary:", {
                  tool: toolUsed,
                  hasData: !!rawToolData.files || !!rawToolData.schema || !!rawToolData.result,
                  fileCount: rawToolData.files?.length,
                  tableCount: rawToolData.schema?.length,
                  hasSearchResult: !!rawToolData.result
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
        }
      } else {
        console.log("No tool needed, proceeding without tool data");
      }
    } catch (e) {
      console.error("Error parsing router response - AI did not return valid JSON:", e);
      console.log("Falling back to no tool. Router content was:", routerContent);
      toolUsed = "none";
      rawToolData = null;
    }

    // ========== CHAMADA 2: O TRADUTOR ==========
    console.log("========== STEP 3: TRANSLATOR CALL ==========");
    
    // Build the translator system prompt with enhanced analytical capabilities
    let translatorSystemPrompt = userProfile?.system_instruction || 
      `Você é um Arquiteto de Software Sênior e especialista em análise de código. Sua função é analisar os dados brutos fornecidos pela ferramenta e entregar um insight de alto nível para o usuário. 

NÃO liste apenas os dados. Em vez disso, ESTRUTURE, CATEGORIZE e EXPLIQUE o significado do que foi encontrado. 

Por exemplo:
- Se receber uma lista de arquivos, agrupe-os por funcionalidade (configuração, UI, backend, integração, etc.) e descreva o propósito geral do projeto e sua arquitetura.
- Se receber um schema de banco de dados, explique as relações entre as tabelas, identifique padrões de design (como tabelas de junction, foreign keys), e descreva o modelo de dados de forma conceitual.
- Se receber resultados de busca web, sintetize as informações encontradas de forma clara e objetiva.

Seja conciso, profissional e analítico. Forneça contexto e significado, não apenas dados.`;

    // If we have tool data, add it to the system prompt with clear instructions
    if (toolUsed !== "none" && rawToolData) {
      translatorSystemPrompt += `\n\n---\n### DADOS DA FERRAMENTA (${toolUsed}):\n`;
      translatorSystemPrompt += JSON.stringify(rawToolData, null, 2);
      translatorSystemPrompt += `\n---\n\n`;
      
      if (rawToolData.success) {
        if (rawToolData.isPendingAction) {
          // It's a pending action that needs confirmation
          translatorSystemPrompt += `INSTRUÇÃO CRÍTICA PARA AÇÃO PENDENTE:\n`;
          translatorSystemPrompt += `1. Explique ao usuário EXATAMENTE o que a ação irá fazer.\n`;
          translatorSystemPrompt += `2. Mostre o código/comando que será executado em um bloco de código formatado.\n`;
          translatorSystemPrompt += `3. ALERTE sobre os riscos (se houver), especialmente se for uma ação destrutiva (DELETE, DROP, etc.).\n`;
          translatorSystemPrompt += `4. Informe que a ação foi registrada e está aguardando confirmação.\n`;
          translatorSystemPrompt += `5. A ação ID é: ${rawToolData.action_id}\n`;
          translatorSystemPrompt += `6. NÃO execute nada. Apenas explique e peça confirmação.\n`;
        } else if (toolUsed === "web_search") {
          translatorSystemPrompt += `INSTRUÇÃO: Os dados acima contêm informações obtidas de uma busca na web em tempo real. `;
          translatorSystemPrompt += `Use essas informações para responder à pergunta do usuário de forma precisa e bem fundamentada.`;
        } else {
          translatorSystemPrompt += `INSTRUÇÃO CRÍTICA: Use EXCLUSIVAMENTE os dados brutos acima para responder à pergunta do usuário. `;
          translatorSystemPrompt += `Estes são os dados REAIS que foram buscados do ${toolUsed === "list_github_files" ? "repositório GitHub" : "banco de dados Supabase"}. `;
          translatorSystemPrompt += `Analise-os profundamente, estruture por categoria/função, e forneça uma resposta analítica e bem organizada.`;
        }
      } else {
        translatorSystemPrompt += `IMPORTANTE: A ferramenta retornou erro (${rawToolData.error}). `;
        translatorSystemPrompt += `Informe ao usuário que a integração não está configurada ou que você não tem acesso aos dados solicitados.`;
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
        let toolSources: string[] = [];
        let pendingActionId: string | null = null;
        let pendingActionType: string | null = null;
        let pendingActionPayload: any = null;
        
        // STEP 1: Send initial analysis status
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "status", message: "⚙️ Analisando sua solicitação..." })}\n\n`)
        );
        
        // STEP 2: Send router decision
        if (toolUsed !== "none") {
          let toolName = "Executar ferramenta";
          if (toolUsed === "list_github_files") {
            toolName = "Acessar o GitHub";
          } else if (toolUsed === "get_supabase_schema") {
            toolName = "Consultar o Supabase";
          } else if (toolUsed === "web_search") {
            toolName = "Buscar na Web";
          }
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "status", message: `✅ Intenção identificada: ${toolName}` })}\n\n`)
          );
          
          // STEP 3: Indicate credentials lookup
          if (toolUsed === "get_supabase_schema") {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "status", message: "🔑 Buscando credenciais do projeto no Vault..." })}\n\n`)
            );
            
            // Check if we have project credentials
            if (project?.supabase_project_url) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: "status", message: "✅ Credenciais obtidas." })}\n\n`)
              );
            } else {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: "status", message: "⚠️ Projeto sem integração Supabase configurada." })}\n\n`)
              );
            }
          } else if (toolUsed === "list_github_files") {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "status", message: "🔑 Buscando credenciais do GitHub..." })}\n\n`)
            );
            
            if (project?.github_repo_owner && project?.github_repo_name) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: "status", message: "✅ Credenciais obtidas." })}\n\n`)
              );
            } else {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: "status", message: "⚠️ Repositório GitHub não configurado." })}\n\n`)
              );
            }
          } else if (toolUsed === "web_search") {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "status", message: "🌐 Buscando na web..." })}\n\n`)
            );
          }
          
          // STEP 4: Send tool execution status
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "status", message: `⏳ Executando a ferramenta '${toolUsed}'...` })}\n\n`)
          );
          
          // STEP 5: Send tool result with details
          if (rawToolData && !rawToolData.success) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "status", message: `❌ Erro na ferramenta: ${rawToolData.error || "Falha desconhecida"}` })}\n\n`)
            );
          } else if (rawToolData && rawToolData.success) {
            // Capture sources from web_search tool
            if (toolUsed === "web_search" && rawToolData.sources) {
              toolSources = rawToolData.sources;
            }
            
            // Capture pending action data
            if (rawToolData.isPendingAction) {
              pendingActionId = rawToolData.action_id;
              pendingActionType = rawToolData.action_type;
              pendingActionPayload = rawToolData.payload;
            }
            
            // Provide detailed success feedback
            let successMessage = "✅ Dados obtidos com sucesso.";
            if (rawToolData.isPendingAction) {
              successMessage = "✅ Ação proposta criada. Aguardando confirmação do usuário.";
            } else if (toolUsed === "get_supabase_schema" && rawToolData.totalTables) {
              successMessage = `✅ Schema obtido: ${rawToolData.totalTables} tabela(s) encontrada(s).`;
            } else if (toolUsed === "list_github_files" && rawToolData.files) {
              successMessage = `✅ Repositório acessado: ${rawToolData.files.length} arquivo(s) encontrado(s).`;
            } else if (toolUsed === "web_search" && rawToolData.result) {
              successMessage = `✅ Busca na web concluída.`;
            }
            
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "status", message: successMessage })}\n\n`)
            );
          }
        } else {
          // No tool needed
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "status", message: "✅ Nenhuma ferramenta externa necessária." })}\n\n`)
          );
        }
        
        // STEP 6: Send formulating response status
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "status", message: "💭 Formulando resposta final..." })}\n\n`)
        )
        
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
                // Send sources if available
                if (toolSources.length > 0) {
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ type: "sources", sources: toolSources })}\n\n`)
                  );
                }
                
                // Send pending action if available
                if (pendingActionId) {
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ 
                      type: "pending_action", 
                      action_id: pendingActionId,
                      action_type: pendingActionType,
                      payload: pendingActionPayload
                    })}\n\n`)
                  );
                }
                
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
                  // Send LLM chunk
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ type: "llm_chunk", content: chunk })}\n\n`)
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
