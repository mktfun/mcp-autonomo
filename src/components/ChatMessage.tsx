import { Card, CardContent } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ChevronDown, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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
}

export const ChatMessage = ({ sender, message, isLoading, thoughtSteps, currentStatus, sources }: ChatMessageProps) => {
  const isUser = sender === 'user';
  
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
