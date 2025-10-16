import { Plus, FolderOpen, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Link } from "react-router-dom";

interface Project {
  id: string;
  name: string;
  created_at: string;
}

interface ProjectSidebarProps {
  projects: Project[];
  onNewProject: () => void;
  activeProjectId?: string;
}

export const ProjectSidebar = ({ projects, onNewProject, activeProjectId }: ProjectSidebarProps) => {
  const recentProjects = projects.slice(0, 5);

  return (
    <aside className="w-64 h-full border-r border-border bg-card/30 backdrop-blur-sm flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto p-md space-y-md scrollbar-thin scrollbar-thumb-primary/50 scrollbar-track-background">
        <Button 
          onClick={onNewProject}
          className="w-full"
          size="lg"
        >
          <Plus />
          Novo Projeto
        </Button>

        <Separator />

        <div className="space-y-sm">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Projetos Recentes
          </h3>
          
          {recentProjects.length === 0 ? (
            <p className="text-xs text-muted-foreground py-md">
              Nenhum projeto ainda
            </p>
          ) : (
            <div className="space-y-xs">
              {recentProjects.map((project) => {
                const isActive = activeProjectId === project.id;
                return (
                  <Link
                    key={project.id}
                    to={`/project/${project.id}`}
                    className={`flex items-center gap-sm p-sm rounded-lg transition-colors group ${
                      isActive 
                        ? 'bg-white/10 border-l-4 border-primary' 
                        : 'hover:bg-white/5'
                    }`}
                  >
                    <FolderOpen className={`w-4 h-4 ${isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-primary'}`} />
                    <span className="text-sm truncate">{project.name}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="mt-auto p-md border-t border-border space-y-xs">
        <Button
          asChild
          variant="link"
          className="w-full justify-start text-xs"
        >
          <Link to="/projects">Ver todos os projetos</Link>
        </Button>
        
        <Button
          asChild
          variant="link"
          className="w-full justify-start text-xs"
        >
          <Link to="/settings" className="flex items-center gap-sm">
            <Settings className="w-4 h-4" />
            Configurações
          </Link>
        </Button>
      </div>
    </aside>
  );
};
