import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Zap, AlertTriangle, Loader2 } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ActionConfirmationProps {
  actionId: string;
  actionType: string;
  payload: any;
  onExecuted: () => void;
}

export const ActionConfirmation = ({
  actionId,
  actionType,
  payload,
  onExecuted,
}: ActionConfirmationProps) => {
  const [isExecuting, setIsExecuting] = useState(false);

  const handleConfirm = async () => {
    setIsExecuting(true);
    try {
      const { data, error } = await supabase.functions.invoke("execute-agent-action", {
        body: { actionId },
      });

      if (error) throw error;

      if (data.success) {
        toast.success("Ação executada com sucesso!");
        onExecuted();
      } else {
        toast.error(data.error || "Erro ao executar ação");
      }
    } catch (error) {
      console.error("Error executing action:", error);
      toast.error("Erro ao executar ação");
    } finally {
      setIsExecuting(false);
    }
  };

  const getCodeBlock = () => {
    if (actionType === "propose_sql_execution") {
      return payload.sql_code;
    } else if (actionType === "propose_github_edit") {
      return `File: ${payload.file_path}\n\n${payload.changes_description}`;
    }
    return JSON.stringify(payload, null, 2);
  };

  const isDestructive = () => {
    if (actionType === "propose_sql_execution") {
      const sql = payload.sql_code?.toUpperCase() || "";
      return sql.includes("DELETE") || sql.includes("DROP") || sql.includes("TRUNCATE");
    }
    return false;
  };

  return (
    <Card className="mt-4 p-4 border-2 border-primary/20 bg-primary/5">
      <div className="space-y-4">
        {isDestructive() && (
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            <span className="font-semibold">Atenção: Ação Destrutiva</span>
          </div>
        )}
        
        <div className="space-y-2">
          <p className="text-sm font-medium">Código que será executado:</p>
          <pre className="bg-muted p-3 rounded-lg overflow-x-auto text-xs">
            <code>{getCodeBlock()}</code>
          </pre>
        </div>

        <Button
          onClick={handleConfirm}
          disabled={isExecuting}
          className="w-full"
          size="lg"
        >
          {isExecuting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Executando...
            </>
          ) : (
            <>
              <Zap className="mr-2 h-4 w-4" />
              Confirmar e Executar
            </>
          )}
        </Button>
      </div>
    </Card>
  );
};
