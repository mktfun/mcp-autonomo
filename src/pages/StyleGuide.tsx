import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

const StyleGuide = () => {
  return (
    <div className="min-h-screen bg-background p-lg">
      <div className="container max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-xl">
          <Link to="/">
            <Button variant="ghost" className="mb-md">
              <ArrowLeft className="mr-2" />
              Voltar
            </Button>
          </Link>
          <h1 className="text-4xl font-bold mb-sm">Style Guide</h1>
          <p className="text-muted-foreground">
            Design System do MCP Autônomo - Componentes base com glassmorphism
          </p>
        </div>

        {/* Spacing System */}
        <section className="mb-xl">
          <h2 className="text-2xl font-bold mb-lg">Sistema de Espaçamentos</h2>
          <Card variant="glass" className="p-lg">
            <div className="space-y-md">
              <div className="flex items-center gap-md">
                <div className="w-xs h-8 bg-primary" />
                <span className="font-mono">xs: 4px</span>
              </div>
              <div className="flex items-center gap-md">
                <div className="w-sm h-8 bg-primary" />
                <span className="font-mono">sm: 8px</span>
              </div>
              <div className="flex items-center gap-md">
                <div className="w-md h-8 bg-primary" />
                <span className="font-mono">md: 16px</span>
              </div>
              <div className="flex items-center gap-md">
                <div className="w-lg h-8 bg-primary" />
                <span className="font-mono">lg: 24px</span>
              </div>
              <div className="flex items-center gap-md">
                <div className="w-xl h-8 bg-primary" />
                <span className="font-mono">xl: 32px</span>
              </div>
            </div>
          </Card>
        </section>

        {/* Colors */}
        <section className="mb-xl">
          <h2 className="text-2xl font-bold mb-lg">Paleta de Cores</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-md">
            <Card variant="glass">
              <CardHeader>
                <div className="w-full h-20 bg-primary rounded-lg mb-md" />
                <CardTitle className="text-lg">Primary</CardTitle>
                <CardDescription className="font-mono">#FF4500</CardDescription>
              </CardHeader>
            </Card>
            <Card variant="glass">
              <CardHeader>
                <div className="w-full h-20 bg-secondary rounded-lg mb-md" />
                <CardTitle className="text-lg">Secondary</CardTitle>
                <CardDescription className="font-mono">#FFA500</CardDescription>
              </CardHeader>
            </Card>
            <Card variant="glass">
              <CardHeader>
                <div className="w-full h-20 bg-success rounded-lg mb-md" />
                <CardTitle className="text-lg">Success</CardTitle>
                <CardDescription className="font-mono">#22C55E</CardDescription>
              </CardHeader>
            </Card>
          </div>
        </section>

        {/* Buttons */}
        <section className="mb-xl">
          <h2 className="text-2xl font-bold mb-lg">Botões</h2>
          <div className="space-y-lg">
            <Card variant="glass">
              <CardHeader>
                <CardTitle>Primário (Sólido)</CardTitle>
                <CardDescription>
                  Ação principal - fundo sólido com glow effect
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-md">
                <div className="flex flex-wrap gap-md">
                  <Button variant="default" size="sm">
                    Small
                  </Button>
                  <Button variant="default">Default</Button>
                  <Button variant="default" size="lg">
                    Large
                  </Button>
                  <Button variant="default" disabled>
                    Disabled
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card variant="glass">
              <CardHeader>
                <CardTitle>Secundário (Glass)</CardTitle>
                <CardDescription>
                  Com efeito glassmorphism - borda laranja
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-md">
                <div className="flex flex-wrap gap-md">
                  <Button variant="glass" size="sm">
                    Small
                  </Button>
                  <Button variant="glass">Default</Button>
                  <Button variant="glass" size="lg">
                    Large
                  </Button>
                  <Button variant="glass" disabled>
                    Disabled
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card variant="glass">
              <CardHeader>
                <CardTitle>Texto/Link</CardTitle>
                <CardDescription>
                  Apenas texto com sublinhado em hover
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-md">
                  <Button variant="link">Link Button</Button>
                  <Button variant="ghost">Ghost Button</Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Cards */}
        <section className="mb-xl">
          <h2 className="text-2xl font-bold mb-lg">Cards</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-lg">
            <Card variant="default">
              <CardHeader>
                <CardTitle>Card Padrão</CardTitle>
                <CardDescription>Fundo sólido com borda</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Este é um card com estilo padrão, sem efeito de glassmorphism.
                  Útil para conteúdo que precisa de mais destaque.
                </p>
              </CardContent>
            </Card>

            <Card variant="glass">
              <CardHeader>
                <CardTitle>Card Glass</CardTitle>
                <CardDescription>Glassmorphism effect</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Este card usa o efeito de vidro fosco (glassmorphism) com
                  backdrop-blur e transparência para criar uma estética moderna.
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Inputs */}
        <section className="mb-xl">
          <h2 className="text-2xl font-bold mb-lg">Inputs</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-lg">
            <Card variant="glass">
              <CardHeader>
                <CardTitle>Input Padrão</CardTitle>
              </CardHeader>
              <CardContent className="space-y-md">
                <div className="space-y-sm">
                  <Label htmlFor="input-default">Label</Label>
                  <Input 
                    id="input-default"
                    variant="default" 
                    placeholder="Digite algo..." 
                  />
                </div>
                <div className="space-y-sm">
                  <Label htmlFor="input-default-disabled">Disabled</Label>
                  <Input 
                    id="input-default-disabled"
                    variant="default" 
                    placeholder="Disabled" 
                    disabled 
                  />
                </div>
              </CardContent>
            </Card>

            <Card variant="glass">
              <CardHeader>
                <CardTitle>Input Glass</CardTitle>
              </CardHeader>
              <CardContent className="space-y-md">
                <div className="space-y-sm">
                  <Label htmlFor="input-glass">Label</Label>
                  <Input 
                    id="input-glass"
                    variant="glass" 
                    placeholder="Digite algo..." 
                  />
                  <p className="text-xs text-muted-foreground">
                    Focus para ver o efeito de glow
                  </p>
                </div>
                <div className="space-y-sm">
                  <Label htmlFor="input-glass-disabled">Disabled</Label>
                  <Input 
                    id="input-glass-disabled"
                    variant="glass" 
                    placeholder="Disabled" 
                    disabled 
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Typography */}
        <section className="mb-xl">
          <h2 className="text-2xl font-bold mb-lg">Tipografia</h2>
          <Card variant="glass">
            <CardContent className="space-y-md pt-lg">
              <div>
                <p className="text-xs text-muted-foreground mb-2">Font: JetBrains Mono</p>
                <h1 className="text-4xl font-bold">Heading 1</h1>
              </div>
              <div>
                <h2 className="text-3xl font-bold">Heading 2</h2>
              </div>
              <div>
                <h3 className="text-2xl font-bold">Heading 3</h3>
              </div>
              <div>
                <p className="text-base">
                  Body text - JetBrains Mono garante precisão e legibilidade.
                  Perfeito para interfaces técnicas e código.
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  Small text - usado para descrições e metadados
                </p>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Glassmorphism Demo */}
        <section className="mb-xl">
          <h2 className="text-2xl font-bold mb-lg">Efeito Glassmorphism</h2>
          <div className="relative overflow-hidden rounded-xl p-xl bg-gradient-to-br from-primary/20 to-secondary/20">
            <div className="absolute inset-0 bg-[linear-gradient(to_right,hsl(0_0%_100%/0.05)_1px,transparent_1px),linear-gradient(to_bottom,hsl(0_0%_100%/0.05)_1px,transparent_1px)] bg-[size:2rem_2rem]" />
            
            <div className="relative z-10 grid grid-cols-1 md:grid-cols-3 gap-md">
              <Card variant="glass">
                <CardHeader>
                  <CardTitle className="text-lg">bg-white/5</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm">Fundo semi-transparente</p>
                </CardContent>
              </Card>
              
              <Card variant="glass">
                <CardHeader>
                  <CardTitle className="text-lg">backdrop-blur-lg</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm">Desfoque do fundo</p>
                </CardContent>
              </Card>
              
              <Card variant="glass">
                <CardHeader>
                  <CardTitle className="text-lg">border-white/10</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm">Borda sutil</p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default StyleGuide;
