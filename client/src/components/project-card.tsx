import { useState, useRef, useEffect } from "react";
import { Link } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { formatDate, getColorClass } from "@/lib/utils";
import CollaborationIndicator from "@/components/collaboration-indicator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Check, Pencil, Trash2, Loader2, X } from "lucide-react";
import { Project } from "@shared/schema";
import { Input } from "@/components/ui/input";

interface ProjectCardProps {
  project: Project;
  onDelete: () => void;
}

export default function ProjectCard({ project, onDelete }: ProjectCardProps) {
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [projectName, setProjectName] = useState(project.name);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  
  // Set color theme
  const themeColorClass = getColorClass(project.colorTheme || 'blue');
  
  // Focus the input when editing
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  // Delete project mutation
  const deleteProjectMutation = useMutation({
    mutationFn: async () => {
      // Call the DELETE endpoint to remove the project
      await apiRequest("DELETE", `/api/projects/${project.id}`);
    },
    onSuccess: () => {
      toast({
        title: "Project deleted",
        description: "The project has been deleted.",
      });
      setIsDeleteDialogOpen(false);
      onDelete();
    },
    onError: (error) => {
      toast({
        title: "Error deleting the project",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  // Update project name mutation
  const updateProjectNameMutation = useMutation({
    mutationFn: async (name: string) => {
      // Call the PATCH endpoint to update the project
      await apiRequest("PATCH", `/api/projects/${project.id}`, { name });
    },
    onSuccess: () => {
      toast({
        title: "Project updated",
        description: "The project name has been updated.",
      });
      setIsEditing(false);
      onDelete(); // Use the existing refresh callback
    },
    onError: (error) => {
      toast({
        title: "Error updating the project",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
      setProjectName(project.name); // Restore the original name
      setIsEditing(false);
    },
  });

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsDeleteDialogOpen(true);
  };
  
  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsEditing(true);
  };

  const handleCancelEdit = (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    setProjectName(project.name);
    setIsEditing(false);
  };

  const handleSaveEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    
    if (projectName.trim() === '') {
      toast({
        title: "The name cannot be empty",
        description: "Please enter a valid project name.",
        variant: "destructive",
      });
      return;
    }
    
    if (projectName === project.name) {
      handleCancelEdit();
      return;
    }
    
    updateProjectNameMutation.mutate(projectName);
  };

  return (
    <>
      {/* Use the standard Link component from wouter */}
      {!isEditing ? (
        <Link href={`/projects/${project.id}`}>
          <div className="relative rounded-lg border border-gray-200 bg-white shadow hover:shadow-md cursor-pointer">
            <div className={`absolute top-0 inset-x-0 h-1 ${themeColorClass.base}`}></div>
            <div className="p-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg leading-6 font-medium text-gray-900">{project.name}</h3>
                <span className={`text-xs font-medium ${themeColorClass.light} ${themeColorClass.text} rounded-full px-2 py-1`}>
                  {project.colorTheme === 'blue' ? 'Blue' :
                  project.colorTheme === 'green' ? 'Green' :
                  project.colorTheme === 'red' ? 'Red' :
                  project.colorTheme === 'purple' ? 'Purple' :
                  project.colorTheme === 'orange' ? 'Orange' : 'Default'}
                </span>
              </div>
              <div className="mt-4 space-y-3">
                <div className="flex justify-between">
                  <div>
                    <p className="text-sm text-gray-500">
                      Created: {formatDate(project.createdAt)}
                    </p>
                  </div>
                  <div className="flex space-x-2">
                    <button 
                      type="button" 
                      className={`inline-flex items-center p-1 border border-transparent rounded-full ${themeColorClass.text} hover:${themeColorClass.light} focus:outline-none focus:ring-2 focus:ring-offset-2 focus:${themeColorClass.border}`}
                      onClick={handleEditClick}
                    >
                      <Pencil className="h-5 w-5" />
                    </button>
                    <button 
                      type="button" 
                      className="inline-flex items-center p-1 border border-transparent rounded-full text-gray-500 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                      onClick={handleDeleteClick}
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </div>
                </div>
                <div onClick={(e) => e.stopPropagation()}>
                  <CollaborationIndicator projectId={project.id} className="w-full" showDetails={false} />
                </div>
              </div>
            </div>
          </div>
        </Link>
      ) : (
        // Edit mode
        <div className="relative rounded-lg border border-gray-200 bg-white shadow">
          <div className={`absolute top-0 inset-x-0 h-1 ${themeColorClass.base}`}></div>
          <div className="p-6">
            <div className="flex flex-col space-y-4">
              <div className="flex items-center">
                <Input
                  ref={inputRef}
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  className="flex-1 text-lg font-medium"
                  placeholder="Project name"
                  maxLength={50}
                  onClick={(e) => e.stopPropagation()}
                />
                <span className={`ml-2 text-xs font-medium ${themeColorClass.light} ${themeColorClass.text} rounded-full px-2 py-1`}>
                  {project.colorTheme === 'blue' ? 'Blue' :
                  project.colorTheme === 'green' ? 'Green' :
                  project.colorTheme === 'red' ? 'Red' :
                  project.colorTheme === 'purple' ? 'Purple' :
                  project.colorTheme === 'orange' ? 'Orange' : 'Default'}
                </span>
              </div>
              
              <div className="space-y-3">
                <div className="flex justify-between">
                  <div>
                    <p className="text-sm text-gray-500">
                      Created: {formatDate(project.createdAt)}
                    </p>
                  </div>
                  <div className="flex space-x-2">
                    <button 
                      type="button" 
                      className={`inline-flex items-center p-1 border border-transparent rounded-full text-green-600 hover:bg-green-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500`}
                      onClick={handleSaveEdit}
                      disabled={updateProjectNameMutation.isPending}
                    >
                      {updateProjectNameMutation.isPending ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <Check className="h-5 w-5" />
                      )}
                    </button>
                    <button 
                      type="button" 
                      className="inline-flex items-center p-1 border border-transparent rounded-full text-gray-500 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                      onClick={handleCancelEdit}
                      disabled={updateProjectNameMutation.isPending}
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                </div>
                <div onClick={(e) => e.stopPropagation()}>
                  <CollaborationIndicator projectId={project.id} className="w-full" showDetails={false} />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog 
        open={isDeleteDialogOpen} 
        onOpenChange={setIsDeleteDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Smazat projekt?</AlertDialogTitle>
            <AlertDialogDescription>
              Do you really want to delete the project "{project.name}"? This cannot be undone.
              All PDF files, team memberships, and chat history will be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteProjectMutation.mutate()}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteProjectMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Deleting...
                </>
              ) : (
                "Smazat"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
