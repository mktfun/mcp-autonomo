import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Send, Loader2, Terminal, Database, Github } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AppLayout } from "@/components/layout/AppLayout";
import { ChatMessage } from "@/components/ChatMessage";
import { ProjectSettings } from "@/components/ProjectSettings";

interface Project {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  supabase_project_url: string | null;
  github_repo_name: string | null;
}

interface ThoughtStep {
  type: 'status' | 'tool_call' | 'tool_result' | 'formulating';
  message: string;
  success?: boolean;
  error?: string;
}

interface ChatMessage {
  sender: 'user' | 'ai';
  message: string;
  isLoading?: boolean;
  thoughtSteps?: ThoughtStep[];
  currentStatus?: string;
  sources?: string[];
  createdAt?: string;
  pendingAction?: {
    actionId: string;
    actionType: string;
    payload: any;
  };
  plan?: {
    planLogId: string;
    steps: Array<{
      step: number;
      tool: string;
      parameters: any;
      reasoning: string;
    }>;
    summary: string;
    needsExecution: boolean;
  };
}

const ProjectPage = () => {
  const { id } = useParams<{ id: string }>();
  const [command, setCommand] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [userEmail, setUserEmail] = useState<string>("");
  const [project, setProject] = useState<Project | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const navigate = useNavigate();
  const { toast } = useToast();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Verifica autenticação
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate("/login");
      } else {
        setUserEmail(session.user.email || "");
        fetchProject();
        fetchAllProjects();
        fetchChatHistory();
      }
    });

    // Listener para mudanças de autenticação
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        navigate("/login");
      } else if (session) {
        setUserEmail(session.user.email || "");
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate, id]);

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  const fetchProject = async () => {
    if (!id) {
      toast({
        title: "Erro",
        description: "ID do projeto não encontrado",
        variant: "destructive",
      });
      navigate("/dashboard");
      return;
    }

    setIsLoading(true);

    const { data, error } = await (supabase as any)
      .from("projects")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      toast({
        title: "Erro ao carregar projeto",
        description: error.message,
        variant: "destructive",
      });
      navigate("/dashboard");
    } else if (!data) {
      toast({
        title: "Projeto não encontrado",
        description: "O projeto não existe ou você não tem permissão para acessá-lo",
        variant: "destructive",
      });
      navigate("/dashboard");
    } else {
      setProject(data);
      setIsLoading(false);
    }
  };

  const fetchAllProjects = async () => {
    const { data } = await (supabase as any)
      .from("projects")
      .select("*")
      .order("created_at", { ascending: false });

    if (data) {
      setProjects(data);
    }
  };

  const fetchChatHistory = async () => {
    if (!id) return;

    const { data, error } = await (supabase as any)
      .from("chat_messages")
      .select("*")
      .eq("project_id", id)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error fetching chat history:", error);
      return;
    }

    if (data) {
      const formattedHistory: ChatMessage[] = data.map((msg: any) => ({
        sender: msg.role as 'user' | 'ai',
        message: msg.content,
        createdAt: msg.created_at
      }));
      setChatHistory(formattedHistory);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!command.trim()) return;

    // Add user message to history
    const userMessage: ChatMessage = {
      sender: 'user',
      message: command
    };
    setChatHistory(prev => [...prev, userMessage]);
    
    const userCommand = command;
    setCommand("");
    setIsProcessing(true);

    try {
      // Call the planner edge function
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/planner`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          },
          body: JSON.stringify({
            projectId: id,
            objective: userCommand,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to generate plan");
      }

      const planData = await response.json();
      console.log("Plan received:", planData);

      if (!planData.success) {
        throw new Error(planData.error || "Failed to generate plan");
      }

      // Add AI message with plan
      setChatHistory(prev => [...prev, {
        sender: 'ai',
        message: planData.data.needsExecution 
          ? `Criei um plano de ${planData.data.plan.length} passo(s) para executar sua solicitação. Revise e confirme para executar.`
          : planData.data.summary || "Entendi sua mensagem.",
        plan: planData.data.needsExecution ? {
          planLogId: planData.data.planLogId,
          steps: planData.data.plan,
          summary: planData.data.summary,
          needsExecution: planData.data.needsExecution
        } : undefined,
        createdAt: new Date().toISOString()
      }]);

    } catch (error: any) {
      console.error("Error generating plan:", error);
      
      // Add error message to chat
      setChatHistory(prev => [...prev, {
        sender: 'ai',
        message: `Erro: ${error.message || "Falha ao gerar plano. Tente novamente."}`
      }]);

      toast({
        title: "Erro",
        description: error.message || "Falha ao gerar plano",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExecutePlan = async (planLogId: string) => {
    setIsProcessing(true);

    try {
      // Call the execute-plan edge function
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/execute-plan`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          },
          body: JSON.stringify({
            planLogId,
            projectId: id,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to execute plan");
      }

      // Handle streaming response
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      
      if (!reader) {
        throw new Error("Failed to get response reader");
      }

      // Create initial AI message for execution results
      setChatHistory(prev => [...prev, {
        sender: 'ai',
        message: '',
        isLoading: true,
        thoughtSteps: [],
        currentStatus: 'Iniciando execução...',
        createdAt: new Date().toISOString()
      }]);

      let accumulatedText = "";
      const thoughtSteps: ThoughtStep[] = [];

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n\n").filter(line => line.trim());

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              
              // Handle status events
              if (data.type === "status") {
                thoughtSteps.push({
                  type: 'status',
                  message: data.message
                });
                
                setChatHistory(prev => {
                  const newHistory = [...prev];
                  const lastMessage = newHistory[newHistory.length - 1];
                  if (lastMessage.sender === 'ai') {
                    lastMessage.thoughtSteps = [...thoughtSteps];
                    lastMessage.currentStatus = data.message;
                    lastMessage.isLoading = true;
                  }
                  return newHistory;
                });
              } 
              // Handle step completion
              else if (data.type === "step_complete") {
                thoughtSteps.push({
                  type: 'tool_result',
                  message: `✓ Passo ${data.step} (${data.tool}) concluído`,
                  success: data.success
                });
                
                setChatHistory(prev => {
                  const newHistory = [...prev];
                  const lastMessage = newHistory[newHistory.length - 1];
                  if (lastMessage.sender === 'ai') {
                    lastMessage.thoughtSteps = [...thoughtSteps];
                  }
                  return newHistory;
                });
              }
              // Handle step errors
              else if (data.type === "step_error") {
                thoughtSteps.push({
                  type: 'tool_result',
                  message: `✗ Erro no passo ${data.step} (${data.tool})`,
                  success: false,
                  error: data.error
                });
                
                setChatHistory(prev => {
                  const newHistory = [...prev];
                  const lastMessage = newHistory[newHistory.length - 1];
                  if (lastMessage.sender === 'ai') {
                    lastMessage.thoughtSteps = [...thoughtSteps];
                  }
                  return newHistory;
                });
              }
              // Handle LLM chunks (final synthesis)
              else if (data.type === "llm_chunk" && data.content) {
                accumulatedText += data.content;
                
                setChatHistory(prev => {
                  const newHistory = [...prev];
                  const lastMessage = newHistory[newHistory.length - 1];
                  if (lastMessage.sender === 'ai') {
                    lastMessage.message = accumulatedText;
                    lastMessage.currentStatus = '';
                    lastMessage.isLoading = false;
                  }
                  return newHistory;
                });
              }
              // Handle completion
              else if (data.type === "complete") {
                setChatHistory(prev => {
                  const newHistory = [...prev];
                  const lastMessage = newHistory[newHistory.length - 1];
                  if (lastMessage.sender === 'ai') {
                    lastMessage.isLoading = false;
                    lastMessage.currentStatus = '';
                  }
                  return newHistory;
                });
              }
            } catch (e) {
              console.error("Error parsing SSE data:", e);
            }
          }
        }
      }
    } catch (error: any) {
      console.error("Error executing plan:", error);
      
      // Add error message to chat
      setChatHistory(prev => [...prev, {
        sender: 'ai',
        message: `Erro na execução: ${error.message || "Falha ao executar plano. Tente novamente."}`
      }]);

      toast({
        title: "Erro",
        description: error.message || "Falha ao executar plano",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    
    if (!error) {
      toast({
        title: "Sessão encerrada",
        description: "Sessão encerrada com sucesso",
      });
    }
  };

  if (isLoading) {
    return (
      <AppLayout
        projects={projects}
        onNewProject={() => navigate("/dashboard")}
        userEmail={userEmail}
        onLogout={handleLogout}
      >
        <div className="max-w-5xl mx-auto space-y-lg">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout
      projects={projects}
      onNewProject={() => navigate("/dashboard")}
      userEmail={userEmail}
      onLogout={handleLogout}
      activeProjectId={id}
    >
      <div className="h-full flex flex-col">
        {/* Cabeçalho do Projeto - Sticky */}
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b border-border pb-md space-y-sm mb-lg">
          <h1 className="text-3xl font-bold flex items-center gap-sm">
            <Terminal className="w-8 h-8 text-primary" />
            {project?.name || "Projeto"}
            <div className="flex items-center gap-xs ml-auto" role="group" aria-label="Status das integrações">
              <Database 
                className={cn(
                  "w-5 h-5 transition-colors",
                  project?.supabase_project_url ? "text-green-500" : "text-muted-foreground opacity-30"
                )}
                aria-label={project?.supabase_project_url ? "Supabase conectado" : "Supabase não conectado"}
              />
              <Github 
                className={cn(
                  "w-5 h-5 transition-colors",
                  project?.github_repo_name ? "text-foreground" : "text-muted-foreground opacity-30"
                )}
                aria-label={project?.github_repo_name ? "GitHub conectado" : "GitHub não conectado"}
              />
            </div>
          </h1>
          <p className="text-sm text-muted-foreground">
            Interface de comando para gerenciar seu projeto
          </p>
        </div>

        {/* Abas com conteúdo unificado */}
        <Tabs defaultValue="command" className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full max-w-md grid-cols-2 mb-md">
            <TabsTrigger value="command">Comando</TabsTrigger>
            <TabsTrigger value="settings">Configurações</TabsTrigger>
          </TabsList>
          {/* Aba Comando (Chat) */}
          <TabsContent value="command" className="flex-1 flex flex-col min-h-0 mt-0">
            {/* Área de Histórico de Chat */}
            <div className="flex-1 overflow-y-auto p-md scrollbar-thin scrollbar-thumb-primary/50 scrollbar-track-background">
              {chatHistory.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center space-y-md">
                    <div className="w-16 h-16 mx-auto border-2 border-muted rounded-xl flex items-center justify-center rotate-45">
                      <Terminal className="w-8 h-8 text-muted-foreground -rotate-45" />
                    </div>
                    <div>
                      <p className="text-lg font-semibold text-muted-foreground">
                        Aguardando comando...
                      </p>
                      <p className="text-sm text-muted-foreground/60 mt-sm">
                        Digite um comando abaixo para iniciar
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-md">
                  {chatHistory.map((msg, index) => (
                    <ChatMessage
                      key={index}
                      sender={msg.sender}
                      message={msg.message}
                      isLoading={msg.isLoading}
                      thoughtSteps={msg.thoughtSteps}
                      currentStatus={msg.currentStatus}
                      sources={msg.sources}
                      createdAt={msg.createdAt}
                      pendingAction={msg.pendingAction}
                      plan={msg.plan}
                      onExecutePlan={handleExecutePlan}
                    />
                  ))}
                  {isProcessing && (
                    <div className="flex justify-start">
                      <div className="bg-card/50 backdrop-blur-sm border border-border rounded-xl rounded-bl-none p-md max-w-xl">
                        <div className="flex items-center gap-sm">
                          <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center">
                            <Loader2 className="w-4 h-4 animate-spin text-primary" />
                          </div>
                          <span className="text-sm text-muted-foreground">
                            Processando...
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* Input de Comando - Fixo na parte inferior */}
            <div className="border-t border-border bg-card/30 backdrop-blur-sm p-md flex-shrink-0">
              <form onSubmit={handleSubmit} className="flex gap-sm">
                <Input
                  variant="glass"
                  placeholder="Digite seu comando para Supabase ou GitHub..."
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  disabled={isProcessing}
                  className="text-base h-12"
                />
                <Button
                  type="submit"
                  disabled={!command.trim() || isProcessing}
                  className="h-12 px-lg"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="animate-spin" />
                      Processando
                    </>
                  ) : (
                    <>
                      <Send />
                      Executar
                    </>
                  )}
                </Button>
              </form>
              <p className="text-xs text-muted-foreground mt-sm">
                Exemplos: "Liste todas as tabelas do banco", "Mostre os últimos commits do repositório"
              </p>
            </div>
          </TabsContent>

          {/* Aba Configurações */}
          <TabsContent value="settings" className="flex-1 overflow-y-auto mt-0 p-md">
            <div className="max-w-4xl">
              {id && project && (
                <ProjectSettings 
                  projectId={id}
                  projectName={project.name}
                  projectDescription={project.description}
                  onUpdate={fetchProject}
                />
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
};

export default ProjectPage;
