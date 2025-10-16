import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProjectCard } from "@/components/ProjectCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Sparkles } from "lucide-react";

interface Project {
  id: string;
  name: string;
  created_at: string;
  supabase_project_url: string | null;
  github_repo_name: string | null;
}

const DashboardPage = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [userEmail, setUserEmail] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [newProjectName, setNewProjectName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    // Verifica autenticação
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate("/login");
      } else {
        setUserEmail(session.user.email || "");
        fetchProjects();
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
  }, [navigate]);

  const fetchProjects = async () => {
    setIsLoading(true);
    const { data, error } = await (supabase as any)
      .from("projects")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast({
        title: "Erro ao carregar projetos",
        description: error.message,
        variant: "destructive",
      });
    } else {
      setProjects(data || []);
    }
    setIsLoading(false);
  };

  const handleCreateProject = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    
    if (!newProjectName.trim()) {
      toast({
        title: "Nome inválido",
        description: "Digite um nome para o projeto",
        variant: "destructive",
      });
      return;
    }

    setIsCreating(true);

    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      toast({
        title: "Erro de autenticação",
        description: "Você precisa estar logado para criar um projeto",
        variant: "destructive",
      });
      setIsCreating(false);
      return;
    }

    const { data, error } = await (supabase as any)
      .from("projects")
      .insert({
        name: newProjectName.trim(),
        user_id: session.user.id,
      })
      .select()
      .single();

    if (error) {
      toast({
        title: "Erro ao criar projeto",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Projeto criado",
        description: `${newProjectName} foi criado com sucesso!`,
      });
      setNewProjectName("");
      fetchProjects();
    }

    setIsCreating(false);
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

  const recentProjects = projects.slice(0, 3);

  return (
    <AppLayout
      projects={projects}
      onNewProject={() => document.getElementById("quick-create-input")?.focus()}
      userEmail={userEmail}
      onLogout={handleLogout}
    >
      <div className="max-w-6xl space-y-xl">
        {/* Quick Create */}
        <div className="space-y-sm">
          <h2 className="text-2xl font-bold flex items-center gap-sm">
            <Sparkles className="w-6 h-6 text-primary" />
            Criar Novo Projeto
          </h2>
          <form onSubmit={handleCreateProject} className="flex gap-sm">
            <Input
              id="quick-create-input"
              variant="glass"
              placeholder="Nome do projeto..."
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              disabled={isCreating}
              className="text-base h-12"
            />
            <Button
              type="submit"
              disabled={!newProjectName.trim() || isCreating}
              className="h-12 px-lg"
            >
              {isCreating ? (
                <>
                  <Loader2 className="animate-spin" />
                  Criando...
                </>
              ) : (
                "Iniciar Projeto"
              )}
            </Button>
          </form>
        </div>

        {/* Recent Projects */}
        <div className="space-y-md">
          <h2 className="text-2xl font-bold">Projetos Recentes</h2>
          
          {isLoading ? (
            <div className="flex items-center justify-center py-xl">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : recentProjects.length === 0 ? (
            <div className="text-center py-xl">
              <p className="text-muted-foreground">
                Nenhum projeto ainda. Crie seu primeiro projeto acima!
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-md">
              {recentProjects.map((project) => (
                <ProjectCard
                  key={project.id}
                  id={project.id}
                  name={project.name}
                  hasSupabase={!!project.supabase_project_url}
                  hasGithub={!!project.github_repo_name}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
};

export default DashboardPage;
