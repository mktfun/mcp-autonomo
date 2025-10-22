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

    console.log("Execute-agent-action: User authenticated:", user.id);

    // Fetch the agent action
    const { data: agentAction, error: actionError } = await supabaseAdmin
      .from("agent_actions")
      .select("*")
      .eq("id", actionId)
      .single();

    if (actionError || !agentAction) {
      throw new Error("Action not found");
    }

    // Verify user owns the project
    const { data: project, error: projectError } = await supabaseAdmin
      .from("projects")
      .select("*")
      .eq("id", agentAction.project_id)
      .eq("user_id", user.id)
      .single();

    if (projectError || !project) {
      throw new Error("Project not found or unauthorized");
    }

    // Check if action is already executed
    if (agentAction.status === "executed") {
      throw new Error("Action already executed");
    }

    const plan = agentAction.payload;
    
    if (!plan || !plan.plan || !Array.isArray(plan.plan)) {
      throw new Error("Invalid plan structure");
    }

    console.log(`Executing plan with ${plan.plan.length} steps`);

    // Create a streaming response
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        
        const sendEvent = (type: string, data: any) => {
          const message = `data: ${JSON.stringify({ type, ...data })}\n\n`;
          controller.enqueue(encoder.encode(message));
        };

        try {
          sendEvent("status", { message: `Iniciando execução de ${plan.plan.length} passo(s)...` });

          const stepResults: any[] = [];

          // Execute each step sequentially
          for (const step of plan.plan) {
            sendEvent("status", { 
              message: `Passo ${step.step}: ${step.reasoning}`,
              currentStep: step.step,
              totalSteps: plan.plan.length
            });

            let stepResult = null;

            try {
              // Route to appropriate tool
              if (step.tool === "list_github_files") {
                const toolResp = await fetch(
                  `${Deno.env.get("SUPABASE_URL")}/functions/v1/tool-list-github-files`,
                  {
                    method: "POST",
                    headers: {
                      Authorization: authHeader,
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ projectId: agentAction.project_id }),
                  }
                );
                stepResult = await toolResp.json();
              } else if (step.tool === "get_supabase_schema") {
                const toolResp = await fetch(
                  `${Deno.env.get("SUPABASE_URL")}/functions/v1/tool-get-supabase-schema`,
                  {
                    method: "POST",
                    headers: {
                      Authorization: authHeader,
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ projectId: agentAction.project_id }),
                  }
                );
                stepResult = await toolResp.json();
              } else if (step.tool === "web_search") {
                const toolResp = await fetch(
                  `${Deno.env.get("SUPABASE_URL")}/functions/v1/tool-web-search`,
                  {
                    method: "POST",
                    headers: {
                      Authorization: authHeader,
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ 
                      query: step.parameters?.query || "general search"
                    }),
                  }
                );
                stepResult = await toolResp.json();
              } else if (step.tool === "add_memory") {
                const toolResp = await fetch(
                  `${Deno.env.get("SUPABASE_URL")}/functions/v1/add-memory`,
                  {
                    method: "POST",
                    headers: {
                      Authorization: authHeader,
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ 
                      projectId: agentAction.project_id,
                      content: step.parameters?.content || "Memory entry"
                    }),
                  }
                );
                stepResult = await toolResp.json();
              } else {
                stepResult = { 
                  success: false, 
                  error: `Unknown tool: ${step.tool}` 
                };
              }

              stepResults.push({
                step: step.step,
                tool: step.tool,
                reasoning: step.reasoning,
                result: stepResult
              });

              sendEvent("step_complete", {
                step: step.step,
                tool: step.tool,
                success: stepResult?.success || false
              });

            } catch (stepError: any) {
              console.error(`Error executing step ${step.step}:`, stepError);
              stepResults.push({
                step: step.step,
                tool: step.tool,
                reasoning: step.reasoning,
                result: { success: false, error: stepError.message }
              });
              
              sendEvent("step_error", {
                step: step.step,
                tool: step.tool,
                error: stepError.message
              });
            }
          }

          // Save all results to memory
          const memorySummary = `Execução do plano concluída:\n${stepResults.map(r => 
            `- Passo ${r.step} (${r.tool}): ${r.result.success ? '✓' : '✗'}`
          ).join('\n')}`;

          await fetch(
            `${Deno.env.get("SUPABASE_URL")}/functions/v1/add-memory`,
            {
              method: "POST",
              headers: {
                Authorization: authHeader,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ 
                projectId: agentAction.project_id,
                content: memorySummary
              }),
            }
          );

          sendEvent("status", { message: "Gerando resposta final..." });

          // Get Lovable API key for final synthesis
          const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
          if (!LOVABLE_API_KEY) {
            throw new Error("LOVABLE_API_KEY is not configured");
          }

          // Call AI to synthesize final response
          const translatorSystemPrompt = `Você é um Arquiteto de Software Sênior. Analise os resultados das ferramentas executadas e forneça uma resposta clara, estruturada e útil para o usuário.

RESULTADOS DAS FERRAMENTAS:
${JSON.stringify(stepResults, null, 2)}

Forneça:
1. Um resumo executivo do que foi encontrado
2. Insights importantes ou padrões identificados
3. Recomendações práticas se aplicável

Seja conciso mas completo. Use markdown para formatação.`;

          const translatorResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash",
              messages: [
                { role: "system", content: translatorSystemPrompt },
                { role: "user", content: "Analise os resultados e forneça sua resposta." }
              ],
              stream: true,
              temperature: 0.7,
            }),
          });

          if (!translatorResp.ok) {
            throw new Error("Failed to generate final response");
          }

          // Stream the AI response
          const reader = translatorResp.body?.getReader();
          const decoder = new TextDecoder();
          
          if (!reader) {
            throw new Error("Failed to get response reader");
          }

          let textBuffer = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            textBuffer += decoder.decode(value, { stream: true });
            
            let newlineIndex: number;
            while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
              let line = textBuffer.slice(0, newlineIndex);
              textBuffer = textBuffer.slice(newlineIndex + 1);

              if (line.endsWith("\r")) line = line.slice(0, -1);
              if (line.startsWith(":") || line.trim() === "") continue;
              if (!line.startsWith("data: ")) continue;

              const jsonStr = line.slice(6).trim();
              if (jsonStr === "[DONE]") break;

              try {
                const parsed = JSON.parse(jsonStr);
                const content = parsed.choices?.[0]?.delta?.content;
                if (content) {
                  sendEvent("llm_chunk", { content });
                }
              } catch {
                // Incomplete JSON, put it back
                textBuffer = line + "\n" + textBuffer;
                break;
              }
            }
          }

          // Update action status to 'executed'
          await supabaseAdmin
            .from("agent_actions")
            .update({ 
              status: "executed",
              executed_at: new Date().toISOString()
            })
            .eq("id", actionId);

          sendEvent("complete", { message: "Execução concluída!" });
          controller.close();

        } catch (error: any) {
          console.error("Error during plan execution:", error);
          
          // Update action status to 'failed'
          await supabaseAdmin
            .from("agent_actions")
            .update({ 
              status: "failed",
            })
            .eq("id", actionId);

          sendEvent("error", { message: error.message });
          controller.close();
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
    console.error("Error in execute-agent-action:", error);
    
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
