import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/hooks/use-language";
import { useLocation } from "wouter";
import { useUpgrade } from "@/contexts/upgrade-context";
import Sidebar from "@/components/sidebar";
import LanguageSwitcher from "@/components/language-switcher";
import { Button } from "@/components/ui/button";
import ProjectCard from "@/components/project-card";
import CreateProjectDialog from "@/components/create-project-dialog";
import { PlusIcon, Loader2, AlertCircle } from "lucide-react";
import { Project } from "@shared/schema";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function Dashboard() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const { user, isLoading: isUserLoading } = useAuth();
  const { language, t } = useLanguage();
  const { openUpgradeDialog } = useUpgrade();
  const [location] = useLocation();

  // Use the standard endpoint with proper authentication
  const { data: projects, isLoading: isProjectsLoading, error, refetch } = useQuery<Project[]>({
    queryKey: ['/api/user/projects'],
    retry: 2,
    refetchOnWindowFocus: true,
    staleTime: 5000, // 5 seconds
    enabled: !!user // Run the query only once the user has loaded
  });
  
  const isLoading = isUserLoading || isProjectsLoading;
  
  // Determine the project quotas based on the user's role
  const getProjectLimits = useMemo(() => {
    if (!user) return { max: 0, used: 0 };
    
    const projectsCount = projects?.length || 0;
    let maxProjects = 1; // Default limit for the 'user' role
    
    switch (user.role) {
      case 'user':
        maxProjects = 1; // Standard - 1 projekt
        break;
      case 'vip':
        maxProjects = 5; // VIP - 5 projects
        break;
      case 'unlimited':
        maxProjects = 99; // Unlimited - 99 projects
        break;
      case 'admin':
        maxProjects = 999; // Admin - 999 projects
        break;
      default:
        maxProjects = 1;
    }
    
    return {
      max: maxProjects,
      used: projectsCount
    };
  }, [user, projects]);

  const handleProjectCreated = () => {
    refetch();
    setIsCreateDialogOpen(false);
  };
  
  // useEffect that checks authentication and session state
  // Effect that checks the upgrade parameter in the URL and shows the dialog
  useEffect(() => {
    if (location.includes('upgrade=true')) {
      openUpgradeDialog();
      // Remove the parameter from the URL so the dialog does not reappear on reload
      window.history.replaceState({}, "", location.split("?")[0]);
    }
  }, [location, openUpgradeDialog]);

  useEffect(() => {
    // Funkce pro kontrolu stavu autentizace
    const checkAuthDebug = async () => {
      try {
        console.log('Kontroluji stav autentizace...');
        const response = await fetch('/api/debug-auth', {
          credentials: 'include',
          headers: {
            'Cache-Control': 'no-cache'
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          console.log('Detaily autentizace:', data);
        } else {
          console.error('Error checking authentication:', response.status);
        }
      } catch (error) {
        console.error('Error checking authentication:', error);
      }
    };
    
    // Run the check after login
    if (user) {
      console.log('User logged in, checking the authentication state');
      checkAuthDebug();
    }
  }, [user]);

  return (
    <div className="h-screen flex overflow-hidden bg-gray-100">
      {/* Sidebar */}
      <Sidebar />

      {/* Main content */}
      <div className="flex flex-col w-0 flex-1 overflow-hidden">
        <main className="flex-1 relative z-0 overflow-y-auto focus:outline-none">
          <div className="py-6">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center justify-between w-full">
                  <h1 className="text-2xl font-semibold text-gray-900">{t('dashboard.projects')}</h1>
                  <div className="flex items-center space-x-4">
                    {!isLoading && user && (
                      <div className="text-sm font-medium text-gray-700 bg-gray-100 p-2 rounded-lg">
                        {t('dashboard.limits', { used: getProjectLimits.used, max: getProjectLimits.max })}
                      </div>
                    )}
                    <LanguageSwitcher />
                  </div>
                </div>
              </div>
              
              {/* Warning that the project limit has been reached */}
              {!isLoading && getProjectLimits.used >= getProjectLimits.max && (
                <Alert className="mb-4">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>
                    {t('dashboard.error')}
                  </AlertTitle>
                  <AlertDescription className="flex flex-col space-y-2">
                    <span>
                      {t('dashboard.upgrade')}
                    </span>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={openUpgradeDialog}
                      className="w-fit"
                    >
                      {t('dashboard.upgrade')}
                    </Button>
                  </AlertDescription>
                </Alert>
              )}
              
              <div className="py-4">
                {isLoading ? (
                  <div className="flex justify-center items-center py-20">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <span className="ml-2">{t('dashboard.loading')}</span>
                  </div>
                ) : error ? (
                  <div className="text-center py-20 text-red-500">
                    {t('dashboard.error')}
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => refetch()}
                      className="ml-2"
                    >
                      {t('dashboard.retry')}
                    </Button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {/* Create New Project Card */}
                    <div className="relative rounded-lg border border-dashed border-gray-300 bg-white p-6 flex items-center justify-center h-48 cursor-pointer hover:border-gray-400">
                      <Button 
                        onClick={() => setIsCreateDialogOpen(true)}
                        className="relative inline-flex items-center p-3 text-lg leading-4 font-medium rounded-md"
                      >
                        <PlusIcon className="-ml-1 mr-2 h-5 w-5" />
                        {t('dashboard.createProject')}
                      </Button>
                    </div>
                    
                    {/* Project cards */}
                    {projects?.map((project) => (
                      <ProjectCard 
                        key={project.id}
                        project={project}
                        onDelete={refetch}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* Create Project Dialog */}
      <CreateProjectDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onProjectCreated={handleProjectCreated}
      />
    </div>
  );
}
