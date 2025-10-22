import { Card, CardContent } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ChevronDown, ExternalLink, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ActionConfirmation } from "./ActionConfirmation";
import { useState, useEffect } from "react";
import { format } from "date-fns";
import { supabase } from "@/lib/supabase";

interface ThoughtStep {
  type: 'status' | 'tool_call' | 'tool_result' | 'formulating';
  message: string;
  success?: boolean;
  error?: string;
}

interface ChatMessageProps {
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
  onExecutePlan?: (planLogId: string) => void;
}

export const ChatMessage = ({ sender, message, isLoading, thoughtSteps, currentStatus, sources, createdAt, pendingAction, plan, onExecutePlan }: ChatMessageProps) => {
  const isUser = sender === 'user';
  const [actionStatus, setActionStatus] = useState<'pending' | 'success' | 'failed' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isPlanExecuting, setIsPlanExecuting] = useState(false);

  // Check action status on mount if pendingAction exists
  useEffect(() => {
    const checkActionStatus = async () => {
      if (!pendingAction) return;

      const { data, error } = await supabase
        .from('agent_actions')
        .select('status')
        .eq('id', pendingAction.actionId)
        .maybeSingle();

      if (error) {
        console.error("Error fetching action status:", error);
        return;
      }

      if (data) {
        if (data.status === 'pending') {
          setActionStatus('pending');
        } else if (data.status === 'executed') {
          setActionStatus('success');
        } else if (data.status === 'failed') {
          setActionStatus('failed');
          setActionError('A execução falhou. Verifique os logs para mais detalhes.');
        }
      }
    };

    checkActionStatus();
  }, [pendingAction]);
  
  const formatTimestamp = (timestamp?: string) => {
    if (!timestamp) return format(new Date(), 'HH:mm');
    try {
      return format(new Date(timestamp), 'HH:mm');
    } catch {
      return format(new Date(), 'HH:mm');
    }
  };
  
  return (
    <div className={cn(
      "flex w-full mb-md",
      isUser ? "justify-end" : "justify-start"
    )}>
      <div className={cn(
        "max-w-xl p-md shadow-sm",
        isUser 
          ? "bg-[#FFA500] text-[#121212] rounded-xl rounded-br-none" 
          : "bg-card/50 backdrop-blur-sm border border-border rounded-xl rounded-bl-none"
      )}>
        <div className="flex items-start gap-sm">
          {!isUser && (
            <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-bold text-primary">AI</span>
            </div>
          )}
          <div className="flex-1 min-w-0 space-y-sm">
            {/* Thought Steps (Process Log) - Accordion */}
            {thoughtSteps && thoughtSteps.length > 0 && (
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="thought-steps" className="border-none">
                  <AccordionTrigger className="text-xs text-muted-foreground hover:text-foreground py-2 hover:no-underline">
                    <span className="flex items-center gap-xs">
                      <ChevronDown className="h-3 w-3" />
                      Ver processo de pensamento da IA...
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="pb-2">
                    <div className="space-y-xs border-l-2 border-primary/30 pl-sm mt-sm">
                      {thoughtSteps.map((step, idx) => (
                        <div key={idx} className="text-xs text-muted-foreground flex items-start gap-xs">
                          <span className="leading-relaxed">{step.message}</span>
                        </div>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            )}
            
            {/* Current Status - Real-time streaming */}
            {currentStatus && (
              <div className="flex items-center gap-sm text-sm text-muted-foreground mb-sm">
                <div className="flex gap-xs">
                  <div className="w-2 h-2 bg-primary rounded-full animate-pulse" style={{ animationDelay: '0ms' }}></div>
                  <div className="w-2 h-2 bg-primary rounded-full animate-pulse" style={{ animationDelay: '150ms' }}></div>
                  <div className="w-2 h-2 bg-primary rounded-full animate-pulse" style={{ animationDelay: '300ms' }}></div>
                </div>
                <span>{currentStatus}</span>
              </div>
            )}
            
            {/* Final Response - Markdown Rendered */}
            {message && (
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown 
                  remarkPlugins={[remarkGfm]}
                  components={{
                    a: ({ node, ...props }) => (
                      <a {...props} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline" />
                    ),
                    code: ({ node, inline, ...props }: any) => (
                      inline 
                        ? <code {...props} className="bg-muted px-1 py-0.5 rounded text-sm font-mono" />
                        : <code {...props} className="block bg-muted p-2 rounded text-sm font-mono overflow-x-auto" />
                    ),
                    ul: ({ node, ...props }) => (
                      <ul {...props} className="list-disc list-inside space-y-1" />
                    ),
                    ol: ({ node, ...props }) => (
                      <ol {...props} className="list-decimal list-inside space-y-1" />
                    ),
                  }}
                >
                  {message}
                </ReactMarkdown>
              </div>
            )}
            
            {/* Sources Section */}
            {sources && sources.length > 0 && (
              <div className="mt-md pt-md border-t border-border">
                <p className="text-xs text-muted-foreground font-semibold mb-xs">Fontes consultadas:</p>
                <div className="space-y-xs">
                  {sources.map((source, idx) => (
                    <a
                      key={idx}
                      href={source}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-xs text-xs text-primary hover:underline"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span className="truncate">{new URL(source).hostname}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Plan Display Section */}
            {plan && plan.needsExecution && !isPlanExecuting && (
              <div className="mt-md p-md bg-primary/5 border border-primary/20 rounded-lg">
                <h3 className="text-sm font-semibold text-primary mb-sm">📋 Plano de Execução</h3>
                <p className="text-sm text-muted-foreground mb-md">{plan.summary}</p>
                
                <div className="space-y-sm mb-md">
                  {plan.steps.map((step) => (
                    <div key={step.step} className="bg-background/50 p-sm rounded border border-border">
                      <div className="flex items-start gap-sm">
                        <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-1 rounded">
                          {step.step}
                        </span>
                        <div className="flex-1">
                          <p className="text-sm font-medium">{step.tool}</p>
                          <p className="text-xs text-muted-foreground mt-1">{step.reasoning}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => {
                    setIsPlanExecuting(true);
                    onExecutePlan?.(plan.planLogId);
                  }}
                  className="w-full py-sm px-md bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors font-medium text-sm"
                >
                  ✓ Confirmar e Executar Plano
                </button>
              </div>
            )}

            {isPlanExecuting && (
              <div className="mt-md p-md bg-primary/5 border border-primary/20 rounded-lg">
                <div className="flex items-center gap-sm text-sm text-primary">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Executando plano...</span>
                </div>
              </div>
            )}

            {/* Action Status Display */}
            {pendingAction && (
              <>
                {actionStatus === 'pending' && (
                  <ActionConfirmation
                    actionId={pendingAction.actionId}
                    actionType={pendingAction.actionType}
                    payload={pendingAction.payload}
                    onExecuted={(success, errorMsg) => {
                      if (success) {
                        setActionStatus('success');
                      } else {
                        setActionStatus('failed');
                        setActionError(errorMsg || 'Erro desconhecido');
                      }
                    }}
                  />
                )}

                {actionStatus === 'success' && (
                  <div className="mt-md p-md bg-success/10 border border-success/20 rounded-lg">
                    <div className="flex items-center gap-sm">
                      <CheckCircle className="h-5 w-5 text-success flex-shrink-0" />
                      <p className="text-sm text-success font-medium">✅ Ação executada com sucesso!</p>
                    </div>
                  </div>
                )}

                {actionStatus === 'failed' && (
                  <div className="mt-md p-md bg-destructive/10 border border-destructive/20 rounded-lg">
                    <div className="flex items-start gap-sm">
                      <XCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm text-destructive font-medium">❌ Falha na execução</p>
                        {actionError && (
                          <p className="text-xs text-destructive/80 mt-1">{actionError}</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
            
            {/* Timestamp */}
            <div className="flex justify-end mt-xs">
              <span className={cn(
                "text-[10px]",
                isUser ? "text-[#121212]/40" : "text-muted-foreground/40"
              )}>
                {formatTimestamp(createdAt)}
              </span>
            </div>
          </div>
          {isUser && (
            <div className="w-7 h-7 rounded-full bg-[#121212]/20 flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-bold text-[#121212]">EU</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
