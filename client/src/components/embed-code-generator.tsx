import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { CopyIcon, CheckIcon, ExternalLinkIcon, Loader2, Palette } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface EmbedCodeGeneratorProps {
  projectId: number;
}

export default function EmbedCodeGenerator({ projectId }: EmbedCodeGeneratorProps) {
  const [isCopied, setIsCopied] = useState(false);
  const [activeTab, setActiveTab] = useState("code");
  const [selectedEmbedStyle, setSelectedEmbedStyle] = useState<"classic" | "advanced" | "premium">("classic");
  const embedCodeRef = useRef<HTMLTextAreaElement>(null);
  const iframeRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch embed code with style parameter
  const { data, isLoading, error } = useQuery<{embedCode: string}>({
    queryKey: [`/api/projects/${projectId}/embed-code`, selectedEmbedStyle],
    enabled: !!projectId,
  });

  // Mutation for updating embed style
  const updateEmbedStyleMutation = useMutation({
    mutationFn: async (embedStyle: "classic" | "advanced" | "premium") => {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ embedStyle }),
      });
      
      if (!response.ok) {
        throw new Error("Failed to update embed style");
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/embed-code`] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}`] });
      toast({
        title: "Embed style updated",
        description: "A new embed snippet has been generated with the selected style",
      });
    },
    onError: () => {
      toast({
        title: "Chyba",
        description: "The embed style could not be updated",
        variant: "destructive",
      });
    },
  });

  const handleCopyCode = () => {
    if (embedCodeRef.current) {
      embedCodeRef.current.select();
      document.execCommand('copy');
      setIsCopied(true);
      toast({
        title: "Code copied",
        description: "The embed snippet has been copied to the clipboard",
      });
      
      // Reset copy status after 2 seconds
      setTimeout(() => {
        setIsCopied(false);
      }, 2000);
    }
  };

  // Get the project data for the preview settings
  const { data: projectData } = useQuery<any>({
    queryKey: [`/api/projects/${projectId}`],
    enabled: !!projectId,
  });

  // Update selected embed style when project data loads
  useEffect(() => {
    if (projectData && projectData.embedStyle && projectData.embedStyle !== 'minimalist') {
      setSelectedEmbedStyle(projectData.embedStyle);
    }
  }, [projectData]);

  // Handle embed style change
  const handleEmbedStyleChange = (style: "classic" | "advanced" | "premium") => {
    setSelectedEmbedStyle(style);
    updateEmbedStyleMutation.mutate(style);
  };

  // Preview the chat widget
  const showPreview = () => {
    if (iframeRef.current && data && projectData) {
      // Use the current domain for the preview
      const currentDomain = window.location.host;
      
      // Get project settings for preview
      const colorTheme = projectData.colorTheme || 'blue';
      const theme = 'light'; // Default theme
      const embedStyle = selectedEmbedStyle;
      
      // Load chat widget in iframe
      const iframe = document.createElement('iframe');
      iframe.src = `${window.location.protocol}//${currentDomain}/embed-preview.html?projectId=${projectId}&theme=${theme}&color=${colorTheme}&style=${embedStyle}&t=${Date.now()}`;
      iframe.style.width = '100%';
      iframe.style.height = '400px';
      iframe.style.border = 'none';
      iframe.style.borderRadius = '8px';
      
      // Clear previous iframe if any
      iframeRef.current.innerHTML = '';
      iframeRef.current.appendChild(iframe);
    }
  };

  // After switching to the preview tab, load the preview automatically
  const handleTabChange = (value: string) => {
    setActiveTab(value);
    if (value === 'preview') {
      setTimeout(showPreview, 100); // Short pause to let the tab switch
    }
  };

  return (
    <Card className="shadow overflow-hidden">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Palette className="h-5 w-5" />
          Embed snippet for your website
        </CardTitle>
        <CardDescription>
          Copy this snippet and paste it into your website
        </CardDescription>
      </CardHeader>
      <CardContent className="border-t border-gray-200 p-6">
        {/* Embed Style Selection */}
        <div className="mb-6 space-y-3">
          <Label htmlFor="embed-style" className="text-sm font-medium text-gray-700">
            Styl widgetu
          </Label>
          <Select
            value={selectedEmbedStyle}
            onValueChange={handleEmbedStyleChange}
            disabled={updateEmbedStyleMutation.isPending}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Vyberte styl embedu" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="classic">
                <div className="flex flex-col">
                  <span className="font-medium">Classic</span>
                  <span className="text-sm text-gray-500">A simple round button in the corner</span>
                </div>
              </SelectItem>
              <SelectItem value="advanced">
                <div className="flex flex-col">
                  <span className="font-medium">Advanced</span>
                  <span className="text-sm text-gray-500">A modern design with animations and advanced features</span>
                </div>
              </SelectItem>
              <SelectItem value="premium">
                <div className="flex flex-col">
                  <span className="font-medium">Premium</span>
                  <span className="text-sm text-gray-500">An elegant design with gradients and cards</span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
          {updateEmbedStyleMutation.isPending && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              Aktualizuji styl embedu...
            </div>
          )}
        </div>

        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList className="mb-4">
            <TabsTrigger value="code">Embed snippet</TabsTrigger>
            <TabsTrigger value="preview">Preview</TabsTrigger>
          </TabsList>
          
          <TabsContent value="code">
            <div className="mb-4">
              <label htmlFor="embed-code" className="block text-sm font-medium text-gray-700 mb-1">
                Embed snippet
              </label>
              {isLoading ? (
                <div className="flex justify-center items-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                </div>
              ) : error ? (
                <div className="text-red-500 text-sm">
                  Error loading the embed snippet
                </div>
              ) : (
                <Textarea
                  id="embed-code"
                  ref={embedCodeRef}
                  value={data?.embedCode || ""}
                  readOnly
                  rows={3}
                  className="shadow-sm focus:ring-primary-500 focus:border-primary-500 block w-full sm:text-sm border-gray-300 rounded-md font-mono"
                />
              )}
            </div>
            <div className="flex justify-between">
              <Button
                variant="outline"
                onClick={handleCopyCode}
                disabled={isLoading || !data}
              >
                {isCopied ? (
                  <>
                    <CheckIcon className="h-4 w-4 mr-2" />
                    Copied
                  </>
                ) : (
                  <>
                    <CopyIcon className="h-4 w-4 mr-2" />
                    Copy code
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => setActiveTab("preview")}
                disabled={isLoading || !data}
              >
                <ExternalLinkIcon className="h-4 w-4 mr-2" />
                Chatbot preview
              </Button>
            </div>
          </TabsContent>
          
          <TabsContent value="preview">
            <div className="mb-4">
              <h3 className="text-sm font-medium text-gray-700 mb-2">
                Chatbot preview
              </h3>
              <div className="bg-gray-100 rounded-lg p-4 h-96 border border-gray-200">
                <div 
                  ref={iframeRef} 
                  className="w-full h-full flex items-center justify-center"
                >
                  <Button
                    onClick={showPreview}
                    variant="outline"
                    className="bg-white"
                  >
                    Load the chatbot preview
                  </Button>
                </div>
              </div>
            </div>
            <div className="text-sm text-gray-500">
              <p>This is a simplified preview of the chatbot. For the real look, paste the embed snippet into your website.</p>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
