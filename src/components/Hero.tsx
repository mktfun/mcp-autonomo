import { Button } from "@/components/ui/button";
import { Terminal, Database, GitBranch } from "lucide-react";

export const Hero = () => {
  return (
    <section className="min-h-screen flex items-center justify-center relative overflow-hidden">
      {/* Grid pattern background */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,hsl(0_0%_20%/0.1)_1px,transparent_1px),linear-gradient(to_bottom,hsl(0_0%_20%/0.1)_1px,transparent_1px)] bg-[size:4rem_4rem]" />
      
      {/* Glow effect */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/20 rounded-full blur-[120px]" />
      
      <div className="container relative z-10 px-4">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          {/* Logo/Icon */}
          <div className="flex justify-center mb-6">
            <div className="relative">
              <div className="w-20 h-20 border-4 border-primary rounded-lg rotate-45 flex items-center justify-center shadow-glow-primary">
                <Terminal className="w-10 h-10 text-primary -rotate-45" />
              </div>
            </div>
          </div>

          {/* Main heading */}
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight">
            <span className="text-foreground">MCP</span>
            <span className="text-primary"> Autônomo</span>
          </h1>

          {/* Subheading */}
          <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Master Control Program para desenvolvedores. Execute consultas, diagnósticos e ações em{" "}
            <span className="text-secondary font-semibold">Supabase</span> e{" "}
            <span className="text-secondary font-semibold">GitHub</span> através de comandos em linguagem natural.
          </p>

          {/* Features */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-8 max-w-3xl mx-auto">
            <div className="bg-card border border-border rounded-lg p-6 hover:border-primary/50 transition-all">
              <Terminal className="w-8 h-8 text-primary mb-3 mx-auto" />
              <h3 className="font-semibold mb-2">Controle Autônomo</h3>
              <p className="text-sm text-muted-foreground">Interpreta intenções e executa ações precisas</p>
            </div>
            <div className="bg-card border border-border rounded-lg p-6 hover:border-primary/50 transition-all">
              <Database className="w-8 h-8 text-secondary mb-3 mx-auto" />
              <h3 className="font-semibold mb-2">Supabase Native</h3>
              <p className="text-sm text-muted-foreground">Consultas e operações em bases de dados</p>
            </div>
            <div className="bg-card border border-border rounded-lg p-6 hover:border-primary/50 transition-all">
              <GitBranch className="w-8 h-8 text-accent mb-3 mx-auto" />
              <h3 className="font-semibold mb-2">GitHub Integration</h3>
              <p className="text-sm text-muted-foreground">Diagnósticos e ações em repositórios</p>
            </div>
          </div>

          {/* CTA */}
          <div className="pt-8 flex gap-md justify-center">
            <Button 
              size="lg" 
              className="bg-primary text-primary-foreground hover:shadow-glow-primary font-semibold text-lg px-8"
              onClick={() => window.location.href = '/'}
            >
              Iniciar Controle
            </Button>
            <Button 
              variant="glass"
              size="lg" 
              onClick={() => window.location.href = '/style-guide'}
            >
              Ver Style Guide
            </Button>
          </div>

          {/* Status indicator */}
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground pt-4">
            <div className="w-2 h-2 bg-success rounded-full animate-pulse" />
            <span>Sistema Operacional</span>
          </div>
        </div>
      </div>
    </section>
  );
};
