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
    const { data, error } = await supabase.from('agent_logs').insert({
      user_id: userId,
      project_id: projectId,
      tool_name: toolName,
      tool_input: toolInput,
      tool_output: toolOutput,
      status,
      error_message: errorMessage,
    }).select().single();
    
    return data?.id;
  } catch (logError) {
    console.error('Failed to log tool execution:', logError);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { projectId, objective } = await req.json();

    if (!projectId || !objective) {
      throw new Error("projectId and objective are required");
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

    console.log("Planner: User authenticated:", user.id, "Objective:", objective);

    // Verify user owns the project
    const { data: project, error: projectError } = await supabaseAdmin
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .eq("user_id", user.id)
      .single();

    if (projectError || !project) {
      throw new Error("Project not found or unauthorized");
    }

    // Get Lovable API key
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Build context about available integrations
    const integrations = [];
    if (project.supabase_project_url) {
      integrations.push("get_supabase_schema (para ler schema do banco de dados)");
    }
    if (project.github_repo_owner && project.github_repo_name) {
      integrations.push("list_github_files (para listar arquivos do repositório GitHub)");
    }
    integrations.push("web_search (para buscar informações na web)");
    integrations.push("add_memory (para salvar informações importantes para futuras consultas)");

    const plannerSystemPrompt = `Você é um planejador de IA autônomo extremamente metódico. Sua função é receber um objetivo do usuário e quebrá-lo em um plano de sub-tarefas executáveis.

FERRAMENTAS DISPONÍVEIS:
${integrations.join('\n')}

REGRAS CRÍTICAS:
1. Responda APENAS com um JSON válido no formato especificado abaixo
2. Cada step deve ter um "reasoning" explicando POR QUE esse passo é necessário
3. Os passos devem ser executados em SEQUÊNCIA (não em paralelo)
4. Seja ESPECÍFICO nos parâmetros de cada ferramenta
5. Se o objetivo não precisar de ferramentas, crie um plano com 0 steps e explique no reasoning

FORMATO DE RESPOSTA (JSON):
{
  "plan": [
    {
      "step": 1,
      "tool": "NOME_DA_FERRAMENTA",
      "parameters": { "chave": "valor" },
      "reasoning": "Por que estou fazendo isso"
    }
  ],
  "summary": "Resumo do que o plano vai fazer"
}

EXEMPLO 1 - Objetivo: "Analise as dependências do meu projeto"
{
  "plan": [
    {
      "step": 1,
      "tool": "list_github_files",
      "parameters": {},
      "reasoning": "Primeiro preciso ver a estrutura do projeto para localizar o package.json"
    },
    {
      "step": 2,
      "tool": "add_memory",
      "parameters": {
        "content": "Análise de dependências realizada. Arquivos encontrados serão processados."
      },
      "reasoning": "Salvar o contexto para futuras consultas"
    }
  ],
  "summary": "Vou listar os arquivos do projeto e salvar a análise na memória"
}

EXEMPLO 2 - Objetivo: "Olá, tudo bem?"
{
  "plan": [],
  "summary": "Este é um cumprimento social que não requer execução de ferramentas. Vou apenas responder educadamente."
}`;

    const plannerPrompt = `OBJETIVO DO USUÁRIO: "${objective}"

CONTEXTO DO PROJETO:
- Nome: ${project.name}
- Descrição: ${project.description || 'Sem descrição'}
- Integrações disponíveis: ${integrations.length} ferramenta(s)

Analise o objetivo e crie um plano de execução detalhado. Retorne APENAS o JSON do plano.`;

    console.log("Calling AI Planner...");

    const plannerResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: plannerSystemPrompt },
          { role: "user", content: plannerPrompt }
        ],
        temperature: 0.2,
      }),
    });

    if (!plannerResp.ok) {
      const errorText = await plannerResp.text();
      console.error("Planner AI call failed:", errorText);
      throw new Error("Failed to generate plan");
    }

    const plannerData = await plannerResp.json();
    let plannerContent = plannerData.choices[0].message.content;
    
    console.log("Raw planner response:", plannerContent);

    // Clean up the response - remove markdown, extra spaces, etc
    plannerContent = plannerContent
      .replace(/```json\s*/g, '')
      .replace(/```\s*/g, '')
      .replace(/^\s+|\s+$/g, '')
      .trim();
    
    console.log("Cleaned planner response:", plannerContent);

    let parsedPlan;
    try {
      parsedPlan = JSON.parse(plannerContent);
    } catch (e) {
      console.error("Failed to parse planner JSON:", e);
      throw new Error("AI did not return valid JSON plan");
    }

    // Validate plan structure
    if (!parsedPlan.plan || !Array.isArray(parsedPlan.plan)) {
      throw new Error("Invalid plan structure: missing 'plan' array");
    }

    // Save plan to agent_logs
    const planLogId = await logToolExecution(
      supabaseAdmin,
      user.id,
      projectId,
      'planner',
      { objective },
      {
        success: true,
        plan: parsedPlan,
        timestamp: new Date().toISOString()
      },
      'success'
    );

    console.log("Plan saved to logs with ID:", planLogId);

    // Return the plan to frontend
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          planLogId,
          plan: parsedPlan.plan,
          summary: parsedPlan.summary,
          needsExecution: parsedPlan.plan.length > 0
        }
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error in planner:", error);
    
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
