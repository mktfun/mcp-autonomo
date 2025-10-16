import { Terminal, LogOut, Settings as SettingsIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

interface HeaderProps {
  userEmail?: string;
  onLogout?: () => void;
}

export const Header = ({ userEmail, onLogout }: HeaderProps) => {
  const navigate = useNavigate();

  return (
    <header className="border-b border-border bg-card/50 backdrop-blur-sm">
      <div className="container mx-auto px-lg py-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-md">
            <div className="relative">
              <div className="w-10 h-10 border-2 border-primary rounded-lg rotate-45 flex items-center justify-center">
                <Terminal className="w-5 h-5 text-primary -rotate-45" />
              </div>
            </div>
            <div>
              <h1 className="text-xl font-bold">
                <span className="text-foreground">MCP</span>
                <span className="text-primary"> Autônomo</span>
              </h1>
              <p className="text-xs text-muted-foreground">Master Control Program</p>
            </div>
          </div>
          
          {userEmail && onLogout && (
            <div className="flex items-center gap-md">
              <span className="text-xs text-white/60">{userEmail}</span>
              <Button
                variant="link"
                size="sm"
                onClick={() => navigate('/settings')}
                className="text-accent hover:text-accent/80 h-auto p-0"
              >
                <SettingsIcon className="w-4 h-4" />
              </Button>
              <Button
                variant="link"
                size="sm"
                onClick={onLogout}
                className="text-accent hover:text-accent/80 h-auto p-0"
              >
                <LogOut className="w-4 h-4" />
                Sair
              </Button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
