import { useState } from "react";
import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import Sidebar from "@/components/sidebar";
import StatsCard from "@/components/stats-card";
import PdfUploader from "@/components/pdf-uploader";
import ChatInterface from "@/components/chat-interface";
import EmbedCodeGenerator from "@/components/embed-code-generator";
import TeamManagement from "@/components/team-management";
import TrainingOptions from "@/components/training-options";
import ChatbotSettings from "@/components/chatbot-settings";
import AiProviderSettings from "@/components/ai-provider-settings";
import FeatureLock from "@/components/feature-lock";
import { Loader2, BarChart3 } from "lucide-react";
import { Project } from "@shared/schema";

export default function ProjectDashboard() {
  const params = useParams<{ id: string }>();
  const projectId = parseInt(params.id);
  const { user } = useAuth();
  const { toast } = useToast();
  const [chatSessionId, setChatSessionId] = useState<number | null>(null);
  
  // Debugging - print the project ID for diagnostics
  console.log("ProjectDashboard - Project ID:", projectId, "Params:", params, "isNaN:", isNaN(projectId));
  
  // We use the standard API endpoint for all operations
  
  // Load the project details
  const { data: project, isLoading: isProjectLoading } = useQuery<Project>({
    queryKey: [`/api/projects/${projectId}`],
    enabled: !isNaN(projectId),
  });

  // Definice typu pro statistiky
  interface ProjectStats {
    totalChats: number;
    uniqueUsers: number;
    totalMessages: number;
    pdfCount: number;
  }
  
  // Fetch project stats - using the standard API endpoint
  const { data: stats, isLoading: isStatsLoading } = useQuery<ProjectStats>({
    queryKey: [`/api/projects/${projectId}/stats`],
    enabled: !isNaN(projectId),
  });

  // The Anthropic API and defaultPrompt functions were removed; they moved to the ChatbotSettings component

  const isLoading = isProjectLoading || isStatsLoading;

  return (
    <div className="h-screen flex overflow-hidden bg-gray-100">
      {/* Sidebar */}
      <Sidebar activeProject={project} />

      {/* Main content */}
      <div className="flex flex-col w-0 flex-1 overflow-hidden">
        {/* Top header */}
        <div className="relative z-10 flex-shrink-0 flex h-16 bg-white shadow">
          <div className="flex-1 px-4 flex justify-between">
            <div className="flex-1 flex">
              <div className="w-full flex md:ml-0">
                <div className="relative w-full flex items-center">
                  <div className="flex items-center">
                    {isProjectLoading ? (
                      <div className="flex items-center">
                        <Loader2 className="h-5 w-5 animate-spin text-primary mr-2" />
                        <h1 className="text-2xl font-bold text-gray-900">Loading the project...</h1>
                      </div>
                    ) : (
                      <>
                        <h1 className="text-2xl font-bold text-gray-900">{project?.name}</h1>
                        <span className="ml-2 inline-flex items-center px-3 py-0.5 rounded-full text-sm font-medium bg-primary-100 text-primary-800">
                          Active
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <main className="flex-1 relative overflow-y-auto focus:outline-none">
          <div className="py-6">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
              {isLoading ? (
                <div className="flex justify-center items-center py-20">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : (
                <>
                  {/* Main content */}
                  <div className="grid grid-cols-1 gap-6">
                    {/* Top section - PDF upload and chat test */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <div id="pdfs">
                        <PdfUploader projectId={projectId} />
                      </div>
                      <div className="flex flex-col gap-4">
                        <ChatInterface 
                          projectId={projectId} 
                          sessionId={chatSessionId}
                          onSessionCreated={setChatSessionId}
                        />
                      </div>
                    </div>

                    {/* Middle section - team management and statistics */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      {/* Team Management */}
                      <div className="bg-white p-5 rounded-lg shadow">
                        {user?.role === 'user' ? (
                          <FeatureLock
                            featureName="Team management"
                            description="Add and manage team members to collaborate on the project"
                            minPlanName="VIP"
                          />
                        ) : (
                          <TeamManagement 
                            projectId={projectId}
                            isOwner={project?.ownerId === user?.id}
                          />
                        )}
                      </div>

                      {/* Odkaz na statistiky */}
                      <div className="bg-white p-5 rounded-lg shadow">
                        <h2 className="text-lg font-semibold mb-4">Statistiky projektu</h2>
                        <div className="flex flex-col space-y-4">
                          <div className="flex items-center text-primary hover:text-primary-dark">
                            <BarChart3 className="h-5 w-5 mr-2" />
                            <Link to={`/projects/${projectId}/statistics`} className="font-medium">
                              Show detailed statistics
                            </Link>
                          </div>
                          <p className="text-gray-500 text-sm">
                            A detailed overview of user interactions with your chatbot, the most common topics, and other analytics.
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Bottom section - settings */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      {/* Training Options */}
                      <div className="bg-white p-5 rounded-lg shadow">
                        {user?.role === 'user' ? (
                          <FeatureLock
                            featureName="Advanced Training Options"
                            description="Advanced AI model settings for better answers based on your documents"
                            minPlanName="VIP"
                          />
                        ) : (
                          <TrainingOptions
                            projectId={projectId}
                          />
                        )}
                      </div>

                      {/* Chatbot settings */}
                      <div className="bg-white p-5 rounded-lg shadow">
                        <ChatbotSettings
                          projectId={projectId}
                        />
                      </div>

                      {/* AI Provider Settings */}
                      <div className="bg-white p-5 rounded-lg shadow">
                        <AiProviderSettings
                          projectId={projectId}
                        />
                      </div>

                      {/* Embed Code */}
                      <div className="bg-white p-5 rounded-lg shadow">
                        <EmbedCodeGenerator projectId={projectId} />
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
