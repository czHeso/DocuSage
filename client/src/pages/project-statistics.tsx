import React from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import Sidebar from "@/components/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import ChatbotAnalytics from "@/components/chatbot-analytics";
import TopicStats from "@/components/topic-stats";
import StatsCard from "@/components/stats-card";
import FeatureLock from "@/components/feature-lock";
import FailedResponses from "@/components/failed-responses";

export default function ProjectStatistics() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const projectId = parseInt(id);

  // Fetch project data
  const { data: project, isLoading: isProjectLoading } = useQuery({
    queryKey: ["/api/projects", projectId],
    queryFn: () =>
      fetch(`/api/projects/${projectId}`).then((res) => {
        if (!res.ok) throw new Error("Projekt nenalezen");
        return res.json();
      }),
  });

  // Fetch project stats
  const { data: stats, isLoading: isStatsLoading } = useQuery({
    queryKey: [`/api/projects/${projectId}/stats`],
    queryFn: () =>
      fetch(`/api/projects/${projectId}/stats`).then((res) => {
        if (!res.ok) throw new Error("Error loading the statistics");
        return res.json();
      }),
    enabled: !isProjectLoading && !!project,
  });

  const isVipOrAdmin =
    user?.role === "vip" ||
    user?.role === "admin" ||
    user?.role === "unlimited";

  if (isProjectLoading) {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
        <Sidebar activeProject={undefined} currentSection="statistics" />
        <div className="md:pl-20 flex flex-col flex-1">
          <main className="flex-1">
            <div className="mx-auto px-4 sm:px-6 md:px-8 py-6">
              <div className="flex flex-col space-y-4">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-80 w-full" />
              </div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-100 dark:bg-gray-900">
      {/* Sidebar */}
      <div className="fixed inset-y-0 left-0 w-64 bg-gray-800 hidden md:block">
        <Sidebar activeProject={project} currentSection="statistics" />
      </div>
      
      {/* Mobile sidebar */}
      <div className="md:hidden">
        <Sidebar activeProject={project} currentSection="statistics" />
      </div>
      
      {/* Main content */}
      <div className="flex-1 w-full md:ml-64 overflow-auto">
        <div className="sticky top-0 z-10">
          <header className="bg-white dark:bg-gray-800 shadow-sm p-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              Statistiky projektu
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              A detailed overview of your chatbot's usage and performance
            </p>
          </header>
        </div>

        <div className="px-4 py-6 space-y-6">
          {/* Panel 1 - project overview */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-5">
            <h2 className="text-lg font-semibold mb-4">Project overview</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <StatsCard
                title="Total chats"
                value={stats?.totalChats || 0}
                icon="chat"
                isLoading={isStatsLoading}
              />
              <StatsCard
                title="Unique users"
                value={stats?.uniqueUsers || 0}
                icon="users"
                isLoading={isStatsLoading}
              />
              <StatsCard
                title="PDF dokumenty"
                value={stats?.pdfCount || 0}
                icon="pdf"
                isLoading={isStatsLoading}
              />
            </div>
          </div>

          {/* Panel 2 - statistics and topics */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Topic statistics */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
              {user?.role === "user" ? (
                <div className="p-5">
                  <FeatureLock
                    featureName="Topic statistics"
                    description="Access statistics on the most common topics in your project"
                    minPlanName="VIP"
                  />
                </div>
              ) : (
                <TopicStats projectId={projectId} />
              )}
            </div>

            {/* Chatbot Analytics */}
            <div className="lg:col-span-2">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                <ChatbotAnalytics projectId={projectId} fullWidth={true} />
              </div>
            </div>
          </div>

          {/* Panel 3 - unsuccessful answers */}
          <div className="grid grid-cols-1 gap-6">
            <FailedResponses projectId={projectId} />
          </div>
        </div>
      </div>
    </div>
  );
}
