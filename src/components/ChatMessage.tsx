import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

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
}

export const ChatMessage = ({ sender, message, isLoading, thoughtSteps }: ChatMessageProps) => {
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
            {/* Thought Steps (Process Log) */}
            {thoughtSteps && thoughtSteps.length > 0 && (
              <div className="space-y-xs border-l-2 border-primary/30 pl-sm">
                {thoughtSteps.map((step, idx) => (
                  <div key={idx} className="text-xs text-muted-foreground flex items-start gap-xs">
                    <span className="leading-relaxed">{step.message}</span>
                  </div>
                ))}
              </div>
            )}
            
            {/* Loading State */}
            {isLoading && !message ? (
              <div className="flex items-center gap-sm text-sm text-muted-foreground">
                <div className="flex gap-xs">
                  <div className="w-2 h-2 bg-primary rounded-full animate-pulse" style={{ animationDelay: '0ms' }}></div>
                  <div className="w-2 h-2 bg-primary rounded-full animate-pulse" style={{ animationDelay: '150ms' }}></div>
                  <div className="w-2 h-2 bg-primary rounded-full animate-pulse" style={{ animationDelay: '300ms' }}></div>
                </div>
                <span>Processando...</span>
              </div>
            ) : message ? (
              /* Final Response */
              <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">{message}</p>
            ) : null}
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
