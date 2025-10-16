import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Send, Loader2, Terminal } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

type Status = "loading" | "ready" | "processing";

const Dashboard = () => {
  const [command, setCommand] = useState("");
  const [status, setStatus] = useState<Status>("loading");
  const [userEmail, setUserEmail] = useState<string>("");
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    // Verifica se o usuário está autenticado
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate("/login");
      } else {
        setUserEmail(session.user.email || "");
        setStatus("ready");
      }
    });

    // Listener para mudanças no estado de autenticação
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        navigate("/login");
      } else if (session) {
        setUserEmail(session.user.email || "");
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!command.trim()) return;

    setStatus("processing");
    // TODO: Integração com IA será implementada no próximo prompt
    console.log("Comando enviado:", command);
    
    // Simulação temporária
    setTimeout(() => {
      setStatus("ready");
      setCommand("");
    }, 1000);
  };

  const getStatusDisplay = () => {
    switch (status) {
      case "loading":
        return {
          icon: <Loader2 className="w-8 h-8 text-primary animate-spin" />,
          title: "Inicializando MCP...",
          description: "Configurando sistema"
        };
      case "processing":
        return {
          icon: <Loader2 className="w-8 h-8 text-warning animate-spin" />,
          title: "Processando comando...",
          description: "Aguarde enquanto executamos sua solicitação"
        };
      case "ready":
      default:
        return {
          icon: (
            <div className="w-16 h-16 mx-auto border-2 border-muted rounded-xl flex items-center justify-center rotate-45">
              <Terminal className="w-8 h-8 text-muted-foreground -rotate-45" />
            </div>
          ),
          title: "Aguardando comando...",
          description: "Digite um comando acima para iniciar"
        };
    }
  };

  const statusDisplay = getStatusDisplay();
  const isProcessing = status === "processing";
  const isLoading = status === "loading";

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    
    if (!error) {
      toast({
        title: "Sessão encerrada",
        description: "Sessão encerrada com sucesso",
      });
    }
  };

  return (
    <MainLayout userEmail={userEmail} onLogout={handleLogout}>
      <div className="max-w-5xl mx-auto space-y-lg">
        {/* Área de Input de Comandos */}
        <div className="space-y-sm">
          <label htmlFor="command-input" className="text-sm font-semibold text-foreground">
            Envie um comando
          </label>
          <form onSubmit={handleSubmit} className="flex gap-sm">
            <Input
              id="command-input"
              variant="glass"
              placeholder="Digite seu comando para Supabase ou GitHub..."
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              disabled={isProcessing || isLoading}
              className="text-base h-12"
            />
            <Button
              type="submit"
              disabled={!command.trim() || isProcessing || isLoading}
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
          <p className="text-xs text-muted-foreground">
            Exemplos: "Liste todas as tabelas do banco", "Mostre os últimos commits do repositório"
          </p>
        </div>

        {/* Área de Exibição de Respostas */}
        <Card variant="glass" className="min-h-[500px]">
          <CardContent className="p-lg">
            {isLoading ? (
              <div className="space-y-md">
                <Skeleton className="h-8 w-3/4" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-5/6" />
              </div>
            ) : (
              <div className="flex items-center justify-center h-full min-h-[450px]">
                <div className="text-center space-y-md">
                  {statusDisplay.icon}
                  <div>
                    <p className="text-lg font-semibold text-muted-foreground">
                      {statusDisplay.title}
                    </p>
                    <p className="text-sm text-muted-foreground/60 mt-sm">
                      {statusDisplay.description}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Status Indicator */}
        <div className="flex items-center justify-center gap-sm text-xs">
          <div className={`w-2 h-2 rounded-full ${
            isLoading ? 'bg-primary animate-pulse' : 
            isProcessing ? 'bg-warning animate-pulse' : 
            'bg-success'
          }`} />
          <span className="text-muted-foreground">
            {isLoading ? 'Inicializando sistema' : 
             isProcessing ? 'Processando comando' : 
             'Sistema Operacional'}
          </span>
        </div>
      </div>
    </MainLayout>
  );
};

export default Dashboard;
