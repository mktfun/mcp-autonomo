import React, { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { Loader2, FileText } from "lucide-react";

interface ProjectDetailsProps {
  projectId: string;
  projectName: string;
  projectDescription: string | null;
  onUpdate: () => void;
}

export const ProjectDetails = ({ projectId, projectName, projectDescription, onUpdate }: ProjectDetailsProps) => {
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();
  
  const [details, setDetails] = useState({
    name: projectName,
    description: projectDescription || "",
  });

  useEffect(() => {
    setDetails({
      name: projectName,
      description: projectDescription || "",
    });
  }, [projectName, projectDescription]);

  const handleSave = async () => {
    setIsSaving(true);
    
    try {
      const { error } = await (supabase as any)
        .from("projects")
        .update({
          name: details.name,
          description: details.description || null,
        })
        .eq("id", projectId);

      if (error) {
        throw error;
      }

      toast({
        title: "Detalhes atualizados!",
        description: "As informações do projeto foram salvas com sucesso",
      });
      
      onUpdate();
    } catch (error: any) {
      toast({
        title: "Erro ao salvar",
        description: error.message || "Erro desconhecido",
        variant: "destructive",
      });
    }
    
    setIsSaving(false);
  };

  return (
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
      <CardContent className="space-y-md">
        <div className="space-y-sm">
          <Label htmlFor="project-name">Nome do Projeto</Label>
          <Input
            id="project-name"
            variant="glass"
            placeholder="Meu Projeto Incrível"
            value={details.name}
            onChange={(e) => setDetails({ ...details, name: e.target.value })}
          />
        </div>
        
        <div className="space-y-sm">
          <Label htmlFor="project-description">Descrição do Projeto</Label>
          <Textarea
            id="project-description"
            variant="glass"
            placeholder="Descreva os objetivos e características do seu projeto..."
            value={details.description}
            onChange={(e) => setDetails({ ...details, description: e.target.value })}
            rows={4}
          />
        </div>
        
        <Button 
          onClick={handleSave}
          disabled={isSaving || !details.name.trim()}
          className="w-full"
        >
          {isSaving ? (
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
  );
};
