import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import Sidebar from "@/components/sidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import GlobalTeamManagement from "@/components/global-team-management";
import { Project } from "@shared/schema";
import { Loader2 } from "lucide-react";
import FeatureLock from "@/components/feature-lock";

// Helper component for the project card with its team
const ProjectTeamCard = ({ project }: { project: Project }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // Determine whether the logged-in user owns the project
  const { data: isOwner, isLoading } = useQuery<boolean>({
    queryKey: [`/api/projects/${project.id}/isOwner`],
    enabled: !!project.id && isExpanded,
  });

  return (
    <Card className="shadow overflow-hidden">
      <CardHeader className="bg-gray-50 dark:bg-gray-800/50 cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <div>
              <CardTitle className="text-lg">{project.name}</CardTitle>
              <CardDescription>
                Project team
              </CardDescription>
            </div>
          </div>
          <div className="text-gray-500">
            {isExpanded ? '▲' : '▼'}
          </div>
        </div>
      </CardHeader>
      
      {isExpanded && (
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            <div className="p-4">
              {/* The TeamManagement component would go here - text only for this demo */}
              <p className="text-center py-4">
                {isOwner 
                  ? "You manage this project's team on the project page."
                  : "You do not have permission to edit this project's team."}
              </p>
              <div className="flex justify-center">
                <a href={`/projects/${project.id}?tab=team`} className="text-primary hover:underline">
                  Go to project team management
                </a>
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
};

export default function TeamPage() {
  const { user, isLoading: isUserLoading } = useAuth();
  const [, setLocation] = useLocation();

  // Redirect to login if the user is not logged in
  useEffect(() => {
    if (!isUserLoading && !user) {
      setLocation('/auth');
    }
  }, [user, isUserLoading, setLocation]);

  // Load the projects for the per-project team list
  const { data: projects, isLoading: isProjectsLoading } = useQuery<Project[]>({
    queryKey: ['/api/user/projects'],
    retry: 2,
    enabled: !!user
  });
  
  const isLoading = isUserLoading || isProjectsLoading;
  
  // If the user is not logged in and loading is still in progress, show the loader
  if (isUserLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  // For a standard account, show FeatureLock instead of team management
  if (user?.role === 'user') {
    return (
      <div className="flex min-h-screen bg-gray-100 dark:bg-gray-900">
        <Sidebar />
        <main className="flex-1 p-6">
          <div className="max-w-5xl mx-auto">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Team management</h1>
            
            <FeatureLock
              featureName="Team management"
              description="Add and manage team members to collaborate on your projects"
              minPlanName="VIP"
            />
          </div>
        </main>
      </div>
    );
  }
  
  // For VIP and higher accounts, show the normal content
  return (
    <div className="flex min-h-screen bg-gray-100 dark:bg-gray-900">
      <Sidebar />
      <main className="flex-1 p-6">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Team management</h1>
          
          <Tabs defaultValue="global" className="mb-6">
            <TabsList className="mb-4">
              <TabsTrigger value="global">Global team</TabsTrigger>
              <TabsTrigger value="projects">Project teams</TabsTrigger>
            </TabsList>
            
            <TabsContent value="global">
              <GlobalTeamManagement />
              <div className="mt-4 text-sm text-gray-500 bg-blue-50 dark:bg-blue-900/20 p-4 rounded-md border border-blue-100 dark:border-blue-800">
                <h3 className="font-medium text-blue-800 dark:text-blue-300 mb-1">About the global team</h3>
                <p>Users added to the global team get access to all of your projects, including projects you create in the future.</p>
              </div>
            </TabsContent>
            
            <TabsContent value="projects">
              {isLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : projects && projects.length > 0 ? (
                <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-1">
                  {projects.map(project => (
                    <ProjectTeamCard key={project.id} project={project} />
                  ))}
                </div>
              ) : (
                <Card>
                  <CardContent className="py-10">
                    <div className="text-center">
                      <h3 className="text-lg font-medium text-gray-900 dark:text-white">You have no projects</h3>
                      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        Create your first project and start adding team members.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}