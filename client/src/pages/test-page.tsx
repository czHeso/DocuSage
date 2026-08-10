import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Project } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Loader2, PlusCircle, Trash2, AlertCircle } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import CreateProjectDialog from "@/components/create-project-dialog";

/**
 * Page for testing features that require authentication
 * Uses the standard API endpoints with quota checks
 */
export default function TestPage() {
  const [location, setLocation] = useLocation();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [deletingProjectId, setDeletingProjectId] = useState<number | null>(null);
  const { toast } = useToast();
  const { user, isLoading: isUserLoading } = useAuth();
  
  // If the user is not logged in, redirect them to the login page
  // Use useEffect for the redirect to avoid SSR problems
  useEffect(() => {
    if (!isUserLoading && !user) {
      toast({
        title: "Login required",
        description: "You must log in to access this page",
        variant: "destructive"
      });
      setLocation("/auth");
    }
  }, [user, isUserLoading, setLocation, toast]);
  
  // Get the projects through the standard authenticated API
  const { data: projects, isLoading: isProjectsLoading, refetch } = useQuery<Project[]>({
    queryKey: ['/api/user/projects'],
    retry: 1,
    enabled: !!user
  });
  
  const isLoading = isUserLoading || isProjectsLoading;
  
  // Mutation for deleting a project
  const deleteProjectMutation = useMutation({
    mutationFn: async (projectId: number) => {
      try {
        const response = await apiRequest("DELETE", `/api/projects/${projectId}`);
        console.log("Delete response:", response);
        return response;
      } catch (err) {
        console.error("Error in delete mutation:", err);
        throw err;
      }
    },
    onSuccess: () => {
      toast({
        title: "The project has been deleted",
        description: "The project has been removed",
      });
      // Refresh the project list
      queryClient.invalidateQueries({ queryKey: ['/api/user/projects'] });
    },
    onError: (error) => {
      toast({
        title: "Error deleting the project",
        description: error instanceof Error ? error.message : "The project could not be removed",
        variant: "destructive",
      });
      console.error("Error deleting the project:", error);
    },
    onSettled: () => {
      setDeletingProjectId(null);
    }
  });
  
  const handleProjectCreated = () => {
    refetch();
    setIsCreateDialogOpen(false);
  };

  // If the user is not loaded or logged in, show a message
  if (isUserLoading) {
    return (
      <div className="p-10">
        <div className="flex justify-center py-6">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }
  
  if (!user) {
    return (
      <div className="p-10">
        <Alert variant="destructive" className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Access denied</AlertTitle>
          <AlertDescription>
            You must log in to access this page.
          </AlertDescription>
        </Alert>
      </div>
    );
  }
  
  return (
    <div className="p-10">
      <h1 className="text-3xl font-bold mb-6">Test environment</h1>
      <p className="mb-4 text-gray-600">
        This page is for testing application features. It now requires login and uses
        the standard secured API endpoints, including project quota checks.
      </p>
      
      {/* Info panel about project limits */}
      <Alert className="mb-8">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Project limits</AlertTitle>
        <AlertDescription>
          The number of projects you can create depends on your role:<br />
          - Standard: 1 projekt<br />
          - VIP: 5 projects<br />
          - Unlimited: 99 projects<br />
          - Admin: 999 projects
        </AlertDescription>
      </Alert>
      
      {/* Button for creating a new project */}
      <div className="bg-white p-5 rounded-lg border shadow-sm mb-8">
        <h2 className="text-xl font-semibold mb-4">Create a new project</h2>
        <p className="mb-4 text-gray-600">
          Click the button below to create a new project. Quota limits are checked on creation.
        </p>
        <Button 
          onClick={() => setIsCreateDialogOpen(true)}
          className="w-full flex items-center justify-center"
        >
          <PlusCircle className="mr-2 h-4 w-4" /> 
          Create a new project
        </Button>
      </div>
      
      <h2 className="text-xl font-semibold mb-4">Existing projects:</h2>
      
      {isProjectsLoading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : !projects || projects.length === 0 ? (
        <div className="bg-gray-50 rounded p-4 text-gray-500">
          No projects found
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map(project => (
            <div 
              key={project.id}
              className="bg-white rounded-lg border p-4 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex justify-between items-start">
                <h3 className="font-semibold">{project.name}</h3>
                <span className="text-xs bg-blue-100 text-blue-800 rounded-full px-2 py-1">
                  {project.colorTheme}
                </span>
              </div>
              <p className="text-sm text-gray-500 mt-2">ID: {project.id}</p>
              <p className="text-sm text-gray-500">Created: {new Date(project.createdAt).toLocaleString()}</p>
              
              <div className="mt-4 flex justify-between">
                <div className="flex space-x-2">
                  <Link 
                    href={`/projects/${project.id}`}
                    className="text-sm px-3 py-1 bg-gray-100 rounded hover:bg-gray-200 inline-block"
                  >
                    Zobrazit detail
                  </Link>
                </div>
                  
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    if (window.confirm(`Opravdu chcete smazat projekt ${project.name}?`)) {
                      setDeletingProjectId(project.id);
                      deleteProjectMutation.mutate(project.id);
                    }
                  }}
                  disabled={deletingProjectId === project.id}
                  className="flex items-center"
                >
                  {deletingProjectId === project.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Trash2 className="h-3 w-3" />
                  )}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
      
      {/* Project creation dialog from the component */}
      <CreateProjectDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onProjectCreated={handleProjectCreated}
      />
    </div>
  );
}