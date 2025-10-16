import { Header } from "./Header";

interface MainLayoutProps {
  children: React.ReactNode;
  userEmail?: string;
  onLogout?: () => void;
}

export const MainLayout = ({ children, userEmail, onLogout }: MainLayoutProps) => {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header userEmail={userEmail} onLogout={onLogout} />
      <main className="flex-1 container mx-auto px-lg py-xl">
        {children}
      </main>
    </div>
  );
};
