import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Project } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import Sidebar from "@/components/sidebar";
import ApiSettings from "@/components/api-settings";
import FeatureLock from "@/components/feature-lock";

export default function ProjectApi() {
  const params = useParams();
  const projectId = params.id ? parseInt(params.id, 10) : 0;
  const isValidId = !isNaN(projectId) && projectId > 0;
  const { user } = useAuth();

  // Load the project details
  const { data: project, isLoading: isProjectLoading } = useQuery<Project>({
    queryKey: [`/api/projects/${projectId}`],
    enabled: isValidId,
  });

  // Log pro debugging
  useEffect(() => {
    console.log("ProjectApi - Project ID:", projectId, "Params:", params, "isNaN:", isNaN(projectId));
  }, [projectId, params]);

  if (!isValidId) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Invalid project ID</h1>
          <p>Please navigate to a valid project.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex overflow-hidden bg-gray-100">
      {/* Sidebar - indicating we are in the API section */}
      <Sidebar activeProject={project} currentSection="api" />

      {/* Main content */}
      <div className="flex flex-col w-0 flex-1 overflow-hidden">
        {/* Top header */}
        <div className="relative z-10 flex-shrink-0 flex h-16 bg-white shadow">
          <div className="flex-1 px-4 flex justify-between">
            <div className="flex-1 flex">
              <div className="w-full flex md:ml-0">
                <div className="relative w-full flex items-center">
                  <div className="flex items-center">
                    <h1 className="text-2xl font-bold text-gray-900">
                      {project?.name || "Loading..."} - API access
                    </h1>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <main className="flex-1 relative overflow-y-auto focus:outline-none">
          <div className="py-6">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
              {isProjectLoading ? (
                <div className="flex justify-center items-center py-20">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                </div>
              ) : user?.role === 'user' ? (
                <div>
                  <FeatureLock
                    featureName="API access"
                    description="Connect to the chatbot directly through the API to integrate it into your application"
                    minPlanName="VIP"
                  />
                </div>
              ) : (
                <div>
                  <h2 className="text-xl font-semibold mb-6">API settings and keys</h2>
                  <ApiSettings projectId={projectId} />
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}