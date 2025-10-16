import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { AppLayout } from "@/components/layout/AppLayout";
import { Loader2, Settings as SettingsIcon } from "lucide-react";

const Settings = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [userEmail, setUserEmail] = useState<string>("");
  const [projects, setProjects] = useState<any[]>([]);
  
  // AI Configuration State
  const [aiProvider, setAiProvider] = useState("gemini");
  const [aiModel, setAiModel] = useState("gemini-2.5-flash");
  const [apiKey, setApiKey] = useState("");
  const [systemInstruction, setSystemInstruction] = useState("");
  const [temperature, setTemperature] = useState(0.7);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate("/login");
      } else {
        setUserEmail(session.user.email || "");
        fetchUserProfile();
        fetchAllProjects();
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        navigate("/login");
      } else if (session) {
        setUserEmail(session.user.email || "");
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const fetchUserProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("user_profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setAiProvider(data.ai_provider || "gemini");
        setAiModel(data.ai_model || "gemini-2.5-flash");
        setSystemInstruction(data.system_instruction || "");
        setTemperature(data.temperature || 0.7);
      }
    } catch (error) {
      console.error("Error fetching user profile:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchAllProjects = async () => {
    const { data } = await supabase
      .from("projects")
      .select("*")
      .order("created_at", { ascending: false });

    if (data) {
      setProjects(data);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Chama a EDGE FUNCTION, não a RPC diretamente
      const { error } = await supabase.functions.invoke('update-user-settings', {
        body: {
          apiKey: apiKey || undefined, // A chave em texto puro (opcional)
          settings: {
            ai_provider: aiProvider,
            ai_model: aiModel,
            system_instruction: systemInstruction,
            temperature: temperature,
          }
        },
      });

      if (error) throw error;

      toast({
        title: "Configurações salvas com segurança!",
        description: "Suas configurações de IA foram atualizadas com sucesso",
      });

      // Limpa o campo da API key SOMENTE após sucesso
      setApiKey("");
    } catch (error: any) {
      console.error("Error saving settings:", error);
      toast({
        title: "Erro ao salvar",
        description: error.message,
        variant: "destructive",
      });
      // NÃO limpa o campo aqui - deixa o usuário ver o que digitou
    } finally {
      setIsSaving(false);
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
        <div className="flex items-center justify-center h-full">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
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
    >
      <div className="max-w-4xl mx-auto space-y-lg">
        {/* Header */}
        <div className="space-y-sm">
          <h1 className="text-3xl font-bold flex items-center gap-sm">
            <SettingsIcon className="w-8 h-8 text-primary" />
            Configurações
          </h1>
          <p className="text-sm text-muted-foreground">
            Configure seu agente de IA e preferências
          </p>
        </div>

        {/* AI Configuration Card */}
        <Card variant="glass">
          <CardHeader>
            <CardTitle>Configuração do Agente de IA</CardTitle>
            <CardDescription>
              Configure o provedor, modelo e comportamento do seu assistente de IA
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-lg">
            {/* Provider */}
            <div className="space-y-sm">
              <Label htmlFor="provider">Provedor</Label>
              <Select value={aiProvider} onValueChange={setAiProvider}>
                <SelectTrigger id="provider">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gemini">Gemini</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Model */}
            <div className="space-y-sm">
              <Label htmlFor="model">Modelo</Label>
              <Select value={aiModel} onValueChange={setAiModel}>
                <SelectTrigger id="model">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gemini-2.5-flash">Gemini 2.5 Flash</SelectItem>
                  <SelectItem value="gemini-2.5-pro">Gemini 2.5 Pro</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* API Key */}
            <div className="space-y-sm">
              <Label htmlFor="apiKey">Gemini API Key</Label>
              <Input
                id="apiKey"
                type="password"
                variant="glass"
                placeholder="sk-..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Sua chave será armazenada de forma criptografada
              </p>
            </div>

            {/* System Instruction */}
            <div className="space-y-sm">
              <Label htmlFor="systemInstruction">Instrução do Sistema</Label>
              <Textarea
                id="systemInstruction"
                variant="glass"
                placeholder="Você é um assistente útil que ajuda a gerenciar projetos..."
                value={systemInstruction}
                onChange={(e) => setSystemInstruction(e.target.value)}
                rows={4}
              />
              <p className="text-xs text-muted-foreground">
                Esta instrução define o comportamento e a personalidade do seu assistente
              </p>
            </div>

            {/* Temperature */}
            <div className="space-y-sm">
              <div className="flex justify-between items-center">
                <Label htmlFor="temperature">Temperatura</Label>
                <span className="text-sm text-muted-foreground">{temperature.toFixed(1)}</span>
              </div>
              <Slider
                id="temperature"
                min={0}
                max={1}
                step={0.1}
                value={[temperature]}
                onValueChange={(value) => setTemperature(value[0])}
              />
              <p className="text-xs text-muted-foreground">
                Valores mais baixos tornam as respostas mais previsíveis, valores mais altos mais criativas
              </p>
            </div>

            {/* Save Button */}
            <Button 
              onClick={handleSave}
              disabled={isSaving}
              className="w-full"
            >
              {isSaving ? (
                <>
                  <Loader2 className="animate-spin" />
                  Salvando...
                </>
              ) : (
                "Salvar Configurações"
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default Settings;
