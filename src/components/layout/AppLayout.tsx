import React from 'react';
import { ProjectSidebar } from '../ProjectSidebar';
import { Header } from './Header';

interface AppLayoutProps {
  children: React.ReactNode;
  projects: Array<{
    id: string;
    name: string;
    created_at: string;
  }>;
  onNewProject: () => void;
  userEmail?: string;
  onLogout?: () => void;
  activeProjectId?: string;
}

export const AppLayout = ({ 
  children, 
  projects, 
  onNewProject, 
  userEmail, 
  onLogout,
  activeProjectId 
}: AppLayoutProps) => {
  return (
    <div className="flex h-screen w-full bg-background overflow-hidden">
      {/* 1. SIDEBAR FIXA E COM ALTURA TOTAL */}
      <ProjectSidebar 
        projects={projects} 
        onNewProject={onNewProject} 
        activeProjectId={activeProjectId} 
      />

      {/* 2. CONTAINER PRINCIPAL (HEADER + CONTEÚDO) */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* 3. HEADER FIXO (NÃO ROLA) */}
        <Header userEmail={userEmail} onLogout={onLogout} />

        {/* 4. ÁREA DE CONTEÚDO QUE ROLA (A MÁGICA ESTÁ AQUI) */}
        <main className="flex-1 overflow-y-auto p-xl scrollbar-thin scrollbar-thumb-primary/50 scrollbar-track-background">
          {children}
        </main>
      </div>
    </div>
  );
};
