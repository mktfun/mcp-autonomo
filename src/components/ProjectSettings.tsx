import React, { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Database, Github, FileText } from "lucide-react";

interface ProjectSettingsProps {
  projectId: string;
  projectName: string;
  projectDescription: string | null;
  onUpdate: () => void;
}

export const ProjectSettings = ({ projectId, projectName, projectDescription, onUpdate }: ProjectSettingsProps) => {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState<'supabase' | 'github' | 'details' | null>(null);
  const { toast } = useToast();
  
  // Estado para os detalhes do projeto
  const [name, setName] = useState(projectName);
  const [description, setDescription] = useState(projectDescription || "");
  
  // Estado para configurações de integração
  const [supabaseConfig, setSupabaseConfig] = useState({
    url: "",
    apiKey: "",
  });
  
  const [githubConfig, setGithubConfig] = useState({
    owner: "",
    repo: "",
    token: "",
  });

  useEffect(() => {
    setName(projectName);
    setDescription(projectDescription || "");
  }, [projectName, projectDescription]);

  useEffect(() => {
    fetchProjectConfig();
  }, [projectId]);

  const fetchProjectConfig = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("projects")
      .select("supabase_project_url, github_repo_owner, github_repo_name")
      .eq("id", projectId)
      .maybeSingle();

    if (error) {
      toast({
        title: "Erro ao carregar configurações",
        description: error.message,
        variant: "destructive",
      });
    } else if (data) {
      setSupabaseConfig({
        url: data.supabase_project_url || "",
        apiKey: "",
      });
      setGithubConfig({
        owner: data.github_repo_owner || "",
        repo: data.github_repo_name || "",
        token: "",
      });
    }
    setIsLoading(false);
  };

  const handleSaveDetails = async () => {
    setIsSaving('details');
    try {
      const { error } = await supabase
        .from("projects")
        .update({
          name: name.trim(),
          description: description.trim() || null,
        })
        .eq("id", projectId);

      if (error) throw error;

      toast({
        title: "Detalhes salvos",
        description: "Os detalhes do projeto foram atualizados com sucesso",
      });

      onUpdate();
    } catch (error: any) {
      toast({
        title: "Erro ao salvar detalhes",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsSaving(null);
    }
  };

  const handleSaveSupabase = async () => {
    setIsSaving('supabase');
    
    try {
      const { error } = await supabase.functions.invoke('update-project-secrets', {
        body: {
          projectId,
          supabaseProjectUrl: supabaseConfig.url,
          supabaseApiKey: supabaseConfig.apiKey || undefined,
        },
      });

      if (error) {
        throw error;
      }

      toast({
        title: "Configurações salvas com segurança!",
        description: "Integração Supabase atualizada e criptografada",
      });
      
      // Clear the API key field after successful save
      setSupabaseConfig(prev => ({ ...prev, apiKey: "" }));
    } catch (error: any) {
      toast({
        title: "Erro ao salvar",
        description: error.message || "Erro desconhecido",
        variant: "destructive",
      });
    }
    
    setIsSaving(null);
  };

  const handleSaveGithub = async () => {
    setIsSaving('github');
    
    try {
      const { error } = await supabase.functions.invoke('update-project-secrets', {
        body: {
          projectId,
          githubRepoOwner: githubConfig.owner,
          githubRepoName: githubConfig.repo,
          githubPat: githubConfig.token || undefined,
        },
      });

      if (error) {
        throw error;
      }

      toast({
        title: "Configurações salvas com segurança!",
        description: "Integração GitHub atualizada e criptografada",
      });
      
      // Clear the token field after successful save
      setGithubConfig(prev => ({ ...prev, token: "" }));
    } catch (error: any) {
      toast({
        title: "Erro ao salvar",
        description: error.message || "Erro desconhecido",
        variant: "destructive",
      });
    }
    
    setIsSaving(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-xl">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-lg max-w-4xl">
      {/* Card de Detalhes do Projeto */}
      <Card variant="glass">
        <CardHeader>
          <CardTitle className="flex items-center gap-sm">
            <FileText className="w-5 h-5 text-primary" />
            Detalhes do Projeto
          </CardTitle>
          <CardDescription>
            Edite o nome e a descrição do seu projeto
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-lg">
          <div className="space-y-sm">
            <Label htmlFor="project-name">Nome do Projeto</Label>
            <Input
              id="project-name"
              variant="glass"
              placeholder="Nome do projeto..."
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-sm">
            <Label htmlFor="project-description">Descrição do Projeto</Label>
            <Textarea
              id="project-description"
              variant="glass"
              placeholder="Descreva seu projeto..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
            />
          </div>

          <Button 
            onClick={handleSaveDetails}
            disabled={isSaving === 'details' || !name.trim()}
            className="w-full"
          >
            {isSaving === 'details' ? (
              <>
                <Loader2 className="animate-spin" />
                Salvando...
              </>
            ) : (
              "Salvar Detalhes"
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Supabase Integration */}
      <Card variant="glass">
        <CardHeader>
          <CardTitle className="flex items-center gap-sm">
            <Database className="w-5 h-5 text-primary" />
            Integração Supabase
          </CardTitle>
          <CardDescription>
            Configure as credenciais do seu projeto Supabase
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-md">
          <div className="space-y-sm">
            <Label htmlFor="supabase-url">URL do Projeto</Label>
            <Input
              id="supabase-url"
              variant="glass"
              placeholder="https://seu-projeto.supabase.co"
              value={supabaseConfig.url}
              onChange={(e) => setSupabaseConfig({ ...supabaseConfig, url: e.target.value })}
            />
          </div>
          
          <div className="space-y-sm">
            <Label htmlFor="supabase-key">Chave de API (Service Role)</Label>
            <Input
              id="supabase-key"
              variant="glass"
              type="password"
              placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
              value={supabaseConfig.apiKey}
              onChange={(e) => setSupabaseConfig({ ...supabaseConfig, apiKey: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              ✅ As chaves são criptografadas antes de serem armazenadas
            </p>
          </div>
          
          <Button 
            onClick={handleSaveSupabase}
            disabled={isSaving === 'supabase'}
            className="w-full"
          >
            {isSaving === 'supabase' ? (
              <>
                <Loader2 className="animate-spin" />
                Salvando...
              </>
            ) : (
              "Salvar Configurações Supabase"
            )}
          </Button>
        </CardContent>
      </Card>

      {/* GitHub Integration */}
      <Card variant="glass">
        <CardHeader>
          <CardTitle className="flex items-center gap-sm">
            <Github className="w-5 h-5 text-primary" />
            Integração GitHub
          </CardTitle>
          <CardDescription>
            Configure as credenciais do seu repositório GitHub
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-md">
          <div className="space-y-sm">
            <Label htmlFor="github-owner">Dono do Repositório</Label>
            <Input
              id="github-owner"
              variant="glass"
              placeholder="seu-usuario"
              value={githubConfig.owner}
              onChange={(e) => setGithubConfig({ ...githubConfig, owner: e.target.value })}
            />
          </div>
          
          <div className="space-y-sm">
            <Label htmlFor="github-repo">Nome do Repositório</Label>
            <Input
              id="github-repo"
              variant="glass"
              placeholder="meu-projeto"
              value={githubConfig.repo}
              onChange={(e) => setGithubConfig({ ...githubConfig, repo: e.target.value })}
            />
          </div>
          
          <div className="space-y-sm">
            <Label htmlFor="github-token">Personal Access Token</Label>
            <Input
              id="github-token"
              variant="glass"
              type="password"
              placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
              value={githubConfig.token}
              onChange={(e) => setGithubConfig({ ...githubConfig, token: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              ✅ Os tokens são criptografados antes de serem armazenados
            </p>
          </div>
          
          <Button 
            onClick={handleSaveGithub}
            disabled={isSaving === 'github'}
            className="w-full"
          >
            {isSaving === 'github' ? (
              <>
                <Loader2 className="animate-spin" />
                Salvando...
              </>
            ) : (
              "Salvar Configurações GitHub"
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};
