import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Project } from "@shared/schema";

export default function EmbedPreview() {
  const [location] = useLocation();
  const [projectId, setProjectId] = useState<string | null>(null);
  const [colorTheme, setColorTheme] = useState<string>("blue");
  const [themeStyle, setThemeStyle] = useState<string>("light");
  const [embedStyle, setEmbedStyle] = useState<string>("classic");

  // Fetch project info for color theme
  const { data: project } = useQuery<Project>({
    queryKey: [`/api/projects/${projectId}`],
    enabled: !!projectId && !isNaN(parseInt(projectId)),
  });

  useEffect(() => {
    // Extract project ID from query parameters
    const searchParams = new URLSearchParams(window.location.search);
    const id = searchParams.get("projectId");
    const style = searchParams.get("style");
    if (id) {
      setProjectId(id);
    }
    if (style) {
      setEmbedStyle(style);
    }
  }, [location]);

  // Set color theme based on project settings
  useEffect(() => {
    if (project && project.colorTheme) {
      setColorTheme(project.colorTheme);
    }
  }, [project]);

  if (!projectId) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <Card className="shadow-lg max-w-md w-full">
          <CardContent className="p-6">
            <h2 className="text-xl font-bold text-center mb-4">Error</h2>
            <p className="text-gray-700">
              The project ID is missing. Add the project ID as a URL parameter to show the preview.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Toggle between light and dark theme
  const toggleTheme = () => {
    setThemeStyle(prev => prev === "light" ? "dark" : "light");
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <Card className="shadow-lg max-w-md w-full">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold">Preview: {project?.chatbotName || 'DocuSage Assistant'}</h2>
            <button 
              onClick={toggleTheme}
              className="text-sm px-3 py-1 rounded bg-gray-200 hover:bg-gray-300"
            >
              {themeStyle === "light" ? "Dark mode" : "Light mode"}
            </button>
          </div>
          <p className="text-gray-700 mb-4">
            This preview shows how the chatbot will look once embedded on your website. You can switch between light and dark mode.
          </p>
          <div className="bg-white border border-gray-200 rounded-lg shadow-md h-96 overflow-hidden">
            <iframe
              src={`${window.location.origin}/embed/${projectId}?theme=${themeStyle}&color=${colorTheme}`}
              className="w-full h-full border-none"
              title="DocuSage Chatbot Preview"
            />
          </div>
          <div className="mt-4 text-sm text-gray-500 bg-gray-50 p-3 rounded-lg">
            <p className="font-medium mb-1">Informace o embedu:</p>
            <p>Chatbot name: {project?.chatbotName || 'DocuSage Assistant'}</p>
            <p>Colour theme: {colorTheme}</p>
            <p>Mode: {themeStyle === "light" ? "light" : "dark"}</p>
            <p>Welcome message: {project?.welcomeMessage ? 
              (project.welcomeMessage.length > 50 ? 
                project.welcomeMessage.substring(0, 50) + '...' : 
                project.welcomeMessage
              ) : 'Hello, how can I help you?'}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}