import { Card, CardContent } from "@/components/ui/card";
import { Database, Github } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

interface ProjectCardProps {
  id: string;
  name: string;
  hasSupabase?: boolean;
  hasGithub?: boolean;
}

export const ProjectCard = ({ id, name, hasSupabase = false, hasGithub = false }: ProjectCardProps) => {
  return (
    <Link to={`/project/${id}`}>
      <Card variant="glass" className="hover:border-primary/50 transition-all cursor-pointer h-full">
        <CardContent className="p-lg space-y-md">
          <div>
            <h3 className="text-lg font-semibold mb-sm">{name}</h3>
            <p className="text-sm text-muted-foreground">
              Projeto criado recentemente. Configure as integrações para começar.
            </p>
          </div>

          <div className="flex items-center gap-md pt-sm border-t border-border">
            <div className="flex items-center gap-xs">
              <Database 
                className={cn(
                  "w-4 h-4 transition-colors",
                  hasSupabase ? "text-green-500" : "text-muted-foreground opacity-30"
                )}
              />
              <span className="text-xs text-muted-foreground">
                {hasSupabase ? 'Conectado' : 'Não conectado'}
              </span>
            </div>

            <div className="flex items-center gap-xs">
              <Github 
                className={cn(
                  "w-4 h-4 transition-colors",
                  hasGithub ? "text-foreground" : "text-muted-foreground opacity-30"
                )}
              />
              <span className="text-xs text-muted-foreground">
                {hasGithub ? 'Conectado' : 'Não conectado'}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
};
