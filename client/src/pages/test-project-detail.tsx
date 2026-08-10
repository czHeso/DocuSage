import { useEffect, useState } from "react";
import { useParams, Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Project } from "@shared/schema";
import { Loader2, Upload, Send, FileText, Settings, ArrowLeft, AlertCircle } from "lucide-react";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { useAuth } from "@/hooks/use-auth";

/**
 * Page showing the project detail
 * Uses the standard API endpoints with access verification
 */
export default function TestProjectDetail() {
  const [location, setLocation] = useLocation();
  const { id } = useParams<{ id: string }>();
  const projectId = parseInt(id);
  const { toast } = useToast();
  const { user, isLoading: isUserLoading } = useAuth();
  
  // Redirect if the user is not logged in
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
  
  // Stav pro chat
  const [message, setMessage] = useState('');
  const [chatMessages, setChatMessages] = useState<{ content: string; isFromUser: boolean }[]>([]);
  const [chatSessionId, setChatSessionId] = useState<number | null>(null);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  
  // State for the Anthropic API key and the default prompt
  const [anthropicApiKey, setAnthropicApiKey] = useState('');
  const [defaultPrompt, setDefaultPrompt] = useState('');
  const [isSavingApiKey, setIsSavingApiKey] = useState(false);
  const [isVerifyingApiKey, setIsVerifyingApiKey] = useState(false);
  const [apiKeyValid, setApiKeyValid] = useState<boolean | null>(null);

  // State for PDF uploading
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  
  // Get the project detail through the standard API
  const { data: project, isLoading: isProjectLoading, refetch: refetchProject } = useQuery<Project>({
    queryKey: [`/api/projects/${projectId}`],
    retry: 1,
    enabled: !isNaN(projectId) && !!user,
  });
  
  // Get the project statistics through the standard API
  const { data: stats, isLoading: isStatsLoading, refetch: refetchStats } = useQuery<{
    totalChats: number;
    uniqueUsers: number;
    totalMessages: number;
    pdfCount: number;
  }>({
    queryKey: [`/api/projects/${projectId}/stats`],
    retry: 1,
    enabled: !isNaN(projectId) && !!user,
  });
  
  // Get the list of PDF documents
  const { data: pdfs = [], isLoading: isPdfsLoading, refetch: refetchPdfs } = useQuery<{ id: number; filename: string; }[]>({
    queryKey: [`/api/projects/${projectId}/pdfs`],
    retry: 1,
    enabled: !isNaN(projectId) && !!user,
  });
  
  // Mutation for sending a message
  const sendMessageMutation = useMutation({
    mutationFn: async ({ message, sessionId }: { message: string, sessionId: number | null }) => {
      return apiRequest("POST", `/api/projects/${projectId}/chat`, { message, sessionId });
    },
    onSuccess: async (response) => {
      const data = await response.json();
      setChatSessionId(data.sessionId);
      setChatMessages(prev => [...prev, { content: data.message.content, isFromUser: false }]);
      setMessage('');
      toast({
        title: "Message sent",
        description: "The AI answer has been received",
      });
      
      // Aktualizovat statistiky
      refetchStats();
    },
    onError: (error) => {
      toast({
        title: "Error sending the message",
        description: "Check that the correct OpenAI API key is set",
        variant: "destructive",
      });
      console.error("Error sending the message:", error);
    },
    onSettled: () => {
      setIsSendingMessage(false);
    }
  });

  // Mutation for uploading a PDF
  const uploadPdfMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return apiRequest("POST", `/api/projects/${projectId}/pdfs`, formData, true);
    },
    onSuccess: async (response) => {
      toast({
        title: "PDF uploaded",
        description: "The document was uploaded and processed successfully",
      });
      
      // Aktualizovat seznam PDF a statistiky
      refetchPdfs();
      refetchStats();
      setSelectedFile(null);
    },
    onError: (error) => {
      toast({
        title: "Error uploading the PDF",
        description: "Check that the correct OpenAI API key is set",
        variant: "destructive",
      });
      console.error("Error uploading the PDF:", error);
    },
    onSettled: () => {
      setIsUploading(false);
    }
  });

  // Mutation for updating the Anthropic API key
  const updateApiKeyMutation = useMutation({
    mutationFn: async (anthropicApiKey: string) => {
      return apiRequest("PATCH", `/api/projects/${projectId}`, { anthropicApiKey });
    },
    onSuccess: async () => {
      toast({
        title: "API key updated",
        description: "The OpenAI API key has been updated",
      });
      
      // Aktualizovat detail projektu
      refetchProject();
    },
    onError: (error) => {
      toast({
        title: "Error updating the API key",
        description: "The OpenAI API key could not be updated",
        variant: "destructive",
      });
      console.error("Error updating the API key:", error);
    },
    onSettled: () => {
      setIsSavingApiKey(false);
    }
  });
  
  // Mutation for verifying the Anthropic API key
  const verifyApiKeyMutation = useMutation({
    mutationFn: async (apiKey: string) => {
      return apiRequest("POST", "/api/verify-anthropic-key", { apiKey });
    },
    onSuccess: async (response) => {
      const data = await response.json();
      setApiKeyValid(data.isValid);
      
      toast({
        title: data.isValid ? "The API key is valid" : "The API key is invalid",
        description: data.message,
        variant: data.isValid ? "default" : "destructive",
      });
    },
    onError: (error) => {
      setApiKeyValid(false);
      toast({
        title: "Error verifying the API key",
        description: "The OpenAI API key could not be verified",
        variant: "destructive",
      });
      console.error("Error verifying the API key:", error);
    },
    onSettled: () => {
      setIsVerifyingApiKey(false);
    }
  });

  // Mutation for updating the project (API key and default prompt)
  const updateProjectMutation = useMutation({
    mutationFn: async (data: { anthropicApiKey?: string, defaultPrompt?: string }) => {
      return apiRequest("PATCH", `/api/projects/${projectId}`, data);
    },
    onSuccess: async () => {
      toast({
        title: "Project settings updated",
        description: "The chatbot settings have been updated",
      });
      
      // Aktualizovat detail projektu
      refetchProject();
    },
    onError: (error) => {
      toast({
        title: "Error updating the settings",
        description: "The chatbot settings could not be updated",
        variant: "destructive",
      });
      console.error("Error updating the settings:", error);
    },
    onSettled: () => {
      setIsSavingApiKey(false);
    }
  });
  
  // After loading the project, put the Anthropic API key and default prompt into state
  useEffect(() => {
    if (project) {
      if (project.anthropicApiKey) {
        setAnthropicApiKey(project.anthropicApiKey);
      }
      if (project.defaultPrompt) {
        setDefaultPrompt(project.defaultPrompt);
      } else {
        setDefaultPrompt("You are a helpful AI assistant.");
      }
    }
  }, [project]);
  
  // Function for sending a message
  const handleSendMessage = () => {
    if (!message.trim()) return;
    
    setIsSendingMessage(true);
    setChatMessages(prev => [...prev, { content: message, isFromUser: true }]);
    sendMessageMutation.mutate({ message, sessionId: chatSessionId });
  };
  
  // Function for uploading a PDF
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };
  
  const handleUploadPdf = () => {
    if (!selectedFile) return;
    
    setIsUploading(true);
    uploadPdfMutation.mutate(selectedFile);
  };
  
  // Function for verifying the API key
  const handleVerifyApiKey = () => {
    if (!anthropicApiKey.trim()) return;
    
    setIsVerifyingApiKey(true);
    verifyApiKeyMutation.mutate(anthropicApiKey);
  };
  
  // Function for updating the API key
  const handleUpdateApiKey = () => {
    setIsSavingApiKey(true);
    updateProjectMutation.mutate({ anthropicApiKey });
  };
  
  // Function for updating the default prompt
  const handleUpdateDefaultPrompt = () => {
    setIsSavingApiKey(true);
    updateProjectMutation.mutate({ defaultPrompt });
  };
  
  const isLoading = isProjectLoading || isStatsLoading || isPdfsLoading;

  if (isNaN(projectId)) {
    return <div className="p-10">Invalid project ID</div>;
  }

  return (
    <div className="p-10">
      <div className="mb-6">
        <Link 
          href="/dashboard"
          className="text-blue-600 hover:text-blue-800 flex items-center gap-1"
        >
          <ArrowLeft className="h-4 w-4" /> Back to dashboard
        </Link>
      </div>
      
      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
      ) : !project ? (
        <div className="bg-red-50 text-red-600 p-4 rounded">
          Projekt nebyl nalezen
        </div>
      ) : (
        <div>
          <h1 className="text-3xl font-bold mb-2">{project.name}</h1>
          <p className="text-gray-500 mb-6">ID: {project.id}</p>
          
          <div className="grid gap-6 md:grid-cols-2 mb-8">
            <div className="bg-white p-5 rounded-lg border shadow-sm">
              <h2 className="text-xl font-semibold mb-4">Detaily projektu</h2>
              <div className="space-y-2">
                <div className="flex justify-between py-2 border-b">
                  <span className="text-gray-600">Colour theme</span>
                  <span className="font-medium">{project.colorTheme}</span>
                </div>
                <div className="flex justify-between py-2 border-b">
                  <span className="text-gray-600">Anthropic API key</span>
                  <span className="font-medium">{project.anthropicApiKey ? "Nastaven" : "Not set"}</span>
                </div>
                <div className="flex justify-between py-2 border-b">
                  <span className="text-gray-600">Created on</span>
                  <span className="font-medium">{new Date(project.createdAt).toLocaleString()}</span>
                </div>
                <div className="flex justify-between py-2 border-b">
                  <span className="text-gray-600">Owner ID</span>
                  <span className="font-medium">{project.ownerId}</span>
                </div>
              </div>
            </div>
            
            {stats && (
              <div className="bg-white p-5 rounded-lg border shadow-sm">
                <h2 className="text-xl font-semibold mb-4">Statistiky</h2>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-blue-50 p-4 rounded">
                    <div className="text-2xl font-bold text-blue-700">{stats.totalChats}</div>
                    <div className="text-sm text-blue-600">Total chats</div>
                  </div>
                  <div className="bg-green-50 p-4 rounded">
                    <div className="text-2xl font-bold text-green-700">{stats.uniqueUsers}</div>
                    <div className="text-sm text-green-600">Unique users</div>
                  </div>
                  <div className="bg-purple-50 p-4 rounded">
                    <div className="text-2xl font-bold text-purple-700">{stats.totalMessages}</div>
                    <div className="text-sm text-purple-600">Total messages</div>
                  </div>
                  <div className="bg-orange-50 p-4 rounded">
                    <div className="text-2xl font-bold text-orange-700">{stats.pdfCount}</div>
                    <div className="text-sm text-orange-600">Number of PDF documents</div>
                  </div>
                </div>
              </div>
            )}
          </div>
          
          <Tabs defaultValue="chat" className="w-full">
            <TabsList className="mb-4">
              <TabsTrigger value="chat" className="flex items-center gap-2">
                <Send className="h-4 w-4" /> Chat
              </TabsTrigger>
              <TabsTrigger value="pdf" className="flex items-center gap-2">
                <FileText className="h-4 w-4" /> PDF dokumenty
              </TabsTrigger>
              <TabsTrigger value="settings" className="flex items-center gap-2">
                <Settings className="h-4 w-4" /> Settings
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="chat" className="space-y-4">
              <div className="bg-white p-5 rounded-lg border shadow-sm">
                <h2 className="text-xl font-semibold mb-4">Chat s AI</h2>
                
                <div className="mb-4 max-h-[400px] overflow-y-auto border rounded-md p-4">
                  {chatMessages.length === 0 ? (
                    <div className="text-center text-gray-500 py-10">
                      <p>No messages yet. Send the first one.</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {chatMessages.map((msg, index) => (
                        <div 
                          key={index} 
                          className={`p-3 rounded-lg max-w-[80%] ${
                            msg.isFromUser ? 
                            'bg-blue-100 ml-auto' : 
                            'bg-gray-100'
                          }`}
                        >
                          {msg.content}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                
                <div className="flex gap-2">
                  <Textarea 
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Type a message..."
                    className="flex-1"
                    disabled={isSendingMessage}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                  />
                  <Button 
                    onClick={handleSendMessage}
                    disabled={!message.trim() || isSendingMessage}
                    className="flex-shrink-0"
                  >
                    {isSendingMessage ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            </TabsContent>
            
            <TabsContent value="pdf" className="space-y-4">
              <div className="bg-white p-5 rounded-lg border shadow-sm">
                <h2 className="text-xl font-semibold mb-4">Upload PDF</h2>
                
                <div className="space-y-4">
                  <div className="border-2 border-dashed rounded-md p-6 text-center">
                    <input
                      id="pdf-upload"
                      type="file"
                      accept=".pdf"
                      className="hidden"
                      onChange={handleFileUpload}
                      disabled={isUploading}
                    />
                    <label 
                      htmlFor="pdf-upload" 
                      className="cursor-pointer block"
                    >
                      <Upload className="mx-auto h-12 w-12 text-gray-400 mb-2" />
                      <p className="text-sm text-gray-500">
                        Click to choose a PDF file, or drag one here
                      </p>
                    </label>
                  </div>
                  
                  {selectedFile && (
                    <div className="flex justify-between items-center p-3 bg-gray-50 rounded-md">
                      <div className="truncate">
                        <FileText className="inline-block mr-2 h-5 w-5" />
                        <span>{selectedFile.name}</span>
                      </div>
                      <Button 
                        onClick={handleUploadPdf}
                        disabled={isUploading}
                        size="sm"
                      >
                        {isUploading ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                          <Upload className="h-4 w-4 mr-2" />
                        )}
                        Upload
                      </Button>
                    </div>
                  )}
                </div>
                
                <div className="mt-6">
                  <h3 className="font-semibold mb-3">Uploaded PDF documents</h3>
                  
                  {pdfs.length === 0 ? (
                    <div className="text-gray-500 text-center py-6">
                      <p>No PDF documents</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {pdfs.map(pdf => (
                        <div key={pdf.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-md">
                          <div className="truncate">
                            <FileText className="inline-block mr-2 h-5 w-5" />
                            <span>{pdf.filename}</span>
                          </div>
                          <div className="text-xs text-gray-500">
                            ID: {pdf.id}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>
            
            <TabsContent value="settings" className="space-y-4">
              <div className="bg-white p-5 rounded-lg border shadow-sm">
                <h2 className="text-xl font-semibold mb-4">Anthropic API key</h2>
                
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="api-key">API key</Label>
                    <div className="flex gap-2 mt-1">
                      <Input
                        id="api-key"
                        value={anthropicApiKey}
                        onChange={(e) => {
                          setAnthropicApiKey(e.target.value);
                          setApiKeyValid(null); // Reset the validation on change
                        }}
                        type="password"
                        placeholder="sk-ant-..."
                        className={`flex-1 ${apiKeyValid === false ? 'border-red-500' : apiKeyValid === true ? 'border-green-500' : ''}`}
                      />
                      <Button 
                        onClick={handleVerifyApiKey}
                        disabled={isVerifyingApiKey || !anthropicApiKey.trim()}
                        variant="outline"
                      >
                        {isVerifyingApiKey ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <span>Verify</span>
                        )}
                      </Button>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      An Anthropic API key is required for the chatbot to work and to process PDF documents.
                    </p>
                    {apiKeyValid === true && (
                      <p className="text-xs text-green-600 mt-1">
                        ✓ The API key is valid and working.
                      </p>
                    )}
                    {apiKeyValid === false && (
                      <p className="text-xs text-red-600 mt-1">
                        ✗ The API key is invalid. Check that you entered the correct key.
                      </p>
                    )}
                  </div>
                  
                  <Button 
                    onClick={handleUpdateApiKey}
                    disabled={isSavingApiKey || !anthropicApiKey.trim()}
                    className="w-full"
                  >
                    {isSavingApiKey ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <span>Save API key</span>
                    )}
                  </Button>
                </div>
              </div>
              
              <div className="bg-white p-5 rounded-lg border shadow-sm">
                <h2 className="text-xl font-semibold mb-4">Default prompt</h2>
                
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="default-prompt">The chatbot's default prompt</Label>
                    <Textarea
                      id="default-prompt"
                      value={defaultPrompt}
                      onChange={(e) => setDefaultPrompt(e.target.value)}
                      placeholder="You are a helpful AI assistant."
                      className="mt-1 min-h-[120px]"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      The default prompt sets the chatbot's behaviour and personality. It is applied at the start of every conversation.
                    </p>
                  </div>
                  
                  <Button 
                    onClick={handleUpdateDefaultPrompt}
                    disabled={isSavingApiKey || !defaultPrompt.trim()}
                    className="w-full"
                  >
                    {isSavingApiKey ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <span>Save default prompt</span>
                    )}
                  </Button>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
}