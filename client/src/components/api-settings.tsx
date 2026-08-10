import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Loader2, Copy, Eye, EyeOff, Key, RefreshCw, Clock } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ApiCall } from "@shared/schema";

interface ApiSettingsProps {
  projectId: number;
}

/** Response of GET /api/projects/:id/api */
interface ApiDetails {
  apiKey: string | null;
  apiEnabled: boolean;
  apiRateLimit: number;
}

/** Response of GET /api/projects/:id/api/stats */
interface ApiStats {
  totalCalls: number;
  todayCalls: number;
  successCalls: number;
  /** Share of successful calls, in the range 0–1 */
  successRate: number;
  rateLimit: number;
}

export default function ApiSettings({ projectId }: ApiSettingsProps) {
  const { toast } = useToast();
  const [apiEnabled, setApiEnabled] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [lastApiCallList, setLastApiCallList] = useState<ApiCall[]>([]);
  const [rateLimit, setRateLimit] = useState(100);
  
  // Load the API details (matches GET /api/projects/:id/api)
  const { data: apiDetails, isLoading: isApiDetailsLoading, refetch: refetchApiDetails } = useQuery<ApiDetails>({
    queryKey: [`/api/projects/${projectId}/api`],
    enabled: projectId > 0,
  });

  // Load the API statistics (matches GET /api/projects/:id/api/stats)
  const { data: apiStats, isLoading: isApiStatsLoading, refetch: refetchApiStats } = useQuery<ApiStats>({
    queryKey: [`/api/projects/${projectId}/api/stats`],
    enabled: projectId > 0,
  });
  
  // Load the API call history
  const { data: apiCalls, isLoading: isApiCallsLoading, refetch: refetchApiCalls } = useQuery<ApiCall[]>({
    queryKey: [`/api/projects/${projectId}/api/calls`],
    enabled: projectId > 0,
  });
  
  // Set the default values
  useEffect(() => {
    if (apiDetails) {
      setApiEnabled(apiDetails.apiEnabled || false);
      setApiKey(apiDetails.apiKey || null);
      setRateLimit(apiDetails.apiRateLimit || 100);
    }
  }, [apiDetails]);
  
  useEffect(() => {
    if (apiCalls && apiCalls.length > 0) {
      setLastApiCallList(apiCalls.slice(0, 5)); // Show the last 5 calls
    }
  }, [apiCalls]);
  
  // Mutation for generating a new API key
  const generateApiKeyMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest(
        "POST", 
        `/api/projects/${projectId}/api/key/generate`
      );
      return await response.json();
    },
    onSuccess: (data) => {
      setApiKey(data.apiKey);
      setShowApiKey(true);
      toast({
        title: "API key generated",
        description: "A new API key has been generated. Copy it now – it will not be shown again.",
      });
      refetchApiDetails();
    },
    onError: (error) => {
      toast({
        title: "Error generating the API key",
        description: "The new API key could not be generated",
        variant: "destructive",
      });
      console.error("Error generating API key:", error);
    },
  });
  
  // Mutation for updating the API settings
  const updateApiSettingsMutation = useMutation({
    mutationFn: async (data: { apiEnabled: boolean; apiRateLimit: number }) => {
      const response = await apiRequest(
        "PATCH", 
        `/api/projects/${projectId}/api/settings`, 
        data
      );
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: "API settings updated",
        description: "The API settings have been updated",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/api`] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/api/stats`] });
    },
    onError: (error) => {
      toast({
        title: "Error updating the API settings",
        description: "The API settings could not be updated",
        variant: "destructive",
      });
      console.error("Error updating API settings:", error);
    },
  });
  
  const toggleApiEnabled = () => {
    const newValue = !apiEnabled;
    setApiEnabled(newValue);
    updateApiSettingsMutation.mutate({ apiEnabled: newValue, apiRateLimit: rateLimit });
  };
  
  const handleRateLimitChange = (value: string) => {
    const limit = parseInt(value);
    if (!isNaN(limit) && limit >= 1) {
      setRateLimit(limit);
    }
  };
  
  const saveRateLimit = () => {
    updateApiSettingsMutation.mutate({ apiEnabled, apiRateLimit: rateLimit });
  };
  
  const copyApiKey = () => {
    if (apiKey) {
      navigator.clipboard.writeText(apiKey);
      toast({
        title: "API key copied",
        description: "The API key has been copied to the clipboard",
      });
    }
  };
  
  const isLoading = isApiDetailsLoading || isApiStatsLoading || isApiCallsLoading;
  
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5 text-primary" />
            API access
          </CardTitle>
          <CardDescription>
            Configure REST API access to your chatbot
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {isLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-8 w-8 animate-spin text-primary/70" />
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between border p-4 rounded-lg">
                <div>
                  <h3 className="text-base font-medium">Enable API access</h3>
                  <p className="text-sm text-muted-foreground">
                    Enable API access to your chatbot for external applications
                  </p>
                </div>
                <div>
                  <Switch 
                    checked={apiEnabled} 
                    onCheckedChange={toggleApiEnabled}
                    disabled={updateApiSettingsMutation.isPending}
                  />
                </div>
              </div>
              
              {apiEnabled && (
                <>
                  <div className="border p-4 rounded-lg space-y-4">
                    <div>
                      <h3 className="text-base font-medium">API key</h3>
                      <p className="text-sm text-muted-foreground mb-2">
                        This key is required to authenticate against the API. Send it in the 'X-API-Key' header.
                      </p>
                      <div className="relative">
                        <Input
                          readOnly
                          value={apiKey ? (showApiKey ? apiKey : "•".repeat(32)) : "No API key"}
                          className="pr-24"
                        />
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex space-x-1">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setShowApiKey(!showApiKey)}
                                  disabled={!apiKey}
                                >
                                  {showApiKey ? (
                                    <EyeOff className="h-4 w-4" />
                                  ) : (
                                    <Eye className="h-4 w-4" />
                                  )}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                {showApiKey ? "Hide API key" : "Show API key"}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={copyApiKey}
                                  disabled={!apiKey}
                                >
                                  <Copy className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Copy API key</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex flex-wrap gap-3">
                      <Button
                        variant="outline"
                        onClick={() => generateApiKeyMutation.mutate()}
                        disabled={generateApiKeyMutation.isPending}
                        className="flex items-center gap-2"
                      >
                        {generateApiKeyMutation.isPending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="mr-2 h-4 w-4" />
                        )}
                        {apiKey ? "Generate a new key" : "Generate an API key"}
                      </Button>
                    </div>
                    
                    <div className="pt-2">
                      <h3 className="text-base font-medium mb-2">Daily API call limit</h3>
                      <div className="flex items-center gap-3">
                        <Input
                          type="number"
                          min="1"
                          value={rateLimit}
                          onChange={(e) => handleRateLimitChange(e.target.value)}
                          className="w-24"
                        />
                        <Button 
                          variant="outline" 
                          onClick={saveRateLimit}
                          disabled={updateApiSettingsMutation.isPending}
                        >
                          {updateApiSettingsMutation.isPending ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : null}
                          Save limit
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        Once the limit is reached, API requests are rejected until the next day
                      </p>
                    </div>
                  </div>
                    
                  {apiStats && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-md font-medium">Total API calls</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-bold">{apiStats?.totalCalls || 0}</div>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-md font-medium">Dnes</CardTitle>
                        </CardHeader>
                        <CardContent className="flex items-center gap-2">
                          <div className="text-2xl font-bold">{apiStats?.todayCalls || 0}</div>
                          <div className="text-xs text-muted-foreground">z {rateLimit}</div>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-md font-medium">Success rate</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-bold">
                            {apiStats?.successRate !== undefined 
                              ? `${Math.round(apiStats.successRate * 100)}%` 
                              : "N/A"}
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  )}
                  
                  {lastApiCallList.length > 0 && (
                    <div>
                      <h3 className="text-base font-medium mb-2">Recent API calls</h3>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Time</TableHead>
                            <TableHead>Endpoint</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {lastApiCallList.map((call) => (
                            <TableRow key={call.id}>
                              <TableCell className="whitespace-nowrap">
                                <div className="flex items-center gap-1">
                                  <Clock className="h-3 w-3 text-muted-foreground" />
                                  {new Date(call.createdAt).toLocaleString()}
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className="font-mono">{call.method}</Badge>{" "}
                                {call.endpoint}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant={call.success ? "default" : "destructive"}
                                  className="whitespace-nowrap"
                                >
                                  {call.statusCode} {call.success ? "OK" : "Error"}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      {apiCalls && apiCalls.length > 5 && (
                        <div className="text-center mt-2">
                          <Button variant="link" onClick={() => refetchApiCalls()}>
                            Show more
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </CardContent>
        <CardFooter className="flex flex-col items-start">
          <div className="text-sm text-muted-foreground">
            <p className="font-medium text-base text-foreground mb-2">API dokumentace:</p>
            
            <div className="space-y-4 w-full">
              <div className="border rounded-md p-3">
                <h4 className="font-medium mb-1">1. Retrieve project information</h4>
                <p className="mb-2">Endpoint: <code className="bg-muted py-0.5 px-1 rounded text-xs">GET https://{window.location.host}/api/p/{projectId}/info</code></p>
                <p className="mb-1">Headers:</p>
                <pre className="bg-muted p-2 rounded text-xs mb-2">
                  X-API-Key: your_api_key
                </pre>
                <p className="mb-1">Response (success):</p>
                <pre className="bg-muted p-2 rounded text-xs">
{`{
  "success": true,
  "data": {
    "id": 123,
    "name": "Project name",
    "description": "Popis projektu",
    "documentCount": 5
  }
}`}
                </pre>
              </div>
              
              <div className="border rounded-md p-3">
                <h4 className="font-medium mb-1">2. Send a message to the chatbot</h4>
                <p className="mb-2">Endpoint: <code className="bg-muted py-0.5 px-1 rounded text-xs">POST https://{window.location.host}/api/p/{projectId}/chat</code></p>
                <p className="mb-1">Headers:</p>
                <pre className="bg-muted p-2 rounded text-xs mb-2">
                  Content-Type: application/json
                  X-API-Key: your_api_key
                </pre>
                <p className="mb-1">Request body (basic - only the required message):</p>
                <pre className="bg-muted p-2 rounded text-xs mb-2">
{`{
  "message": "Your question or message"
}`}
                </pre>
                
                <p className="mb-1">Request body (extended - with optional session and visitor):</p>
                <pre className="bg-muted p-2 rounded text-xs mb-2">
{`{
  "message": "Your question or message",
  "sessionId": "optional_session_id",
  "visitorId": "optional_visitor_id"
}`}
                </pre>
                <p className="text-xs text-muted-foreground mb-2">Note: if you do not supply sessionId or visitorId, the API creates a new session and generates a random visitorId. You can then reuse those values in subsequent requests.</p>
                <p className="mb-1">Response (success):</p>
                <pre className="bg-muted p-2 rounded text-xs">
{`{
  "success": true,
  "data": {
    "response": "The chatbot's answer to your message",
    "sessionId": "current_session_id",
    "visitorId": "visitor_id"
  }
}`}
                </pre>
                <p className="text-xs text-muted-foreground mb-2">Note: the API always returns the current sessionId and visitorId, which you should store and reuse in subsequent requests to keep the conversation context.</p>
              </div>
              
              <div className="border rounded-md p-3">
                <h4 className="font-medium mb-1">3. Retrieve the chat history</h4>
                <p className="mb-2">Endpoint: <code className="bg-muted py-0.5 px-1 rounded text-xs">GET https://{window.location.host}/api/p/{projectId}/chat/{'{sessionId}'}</code></p>
                <p className="mb-1">Headers:</p>
                <pre className="bg-muted p-2 rounded text-xs mb-2">
                  X-API-Key: your_api_key
                </pre>
                <p className="mb-1">Response (success):</p>
                <pre className="bg-muted p-2 rounded text-xs">
{`{
  "success": true,
  "data": {
    "sessionId": "id_session",
    "messages": [
      {
        "content": "Your question or message",
        "isFromUser": true,
        "timestamp": "2025-04-19T10:45:22Z"
      },
      {
        "content": "The chatbot's answer",
        "isFromUser": false,
        "timestamp": "2025-04-19T10:45:24Z"
      }
      // ...more messages
    ]
  }
}`}
                </pre>
              </div>
              
              <div className="border rounded-md p-3">
                <h4 className="font-medium mb-1">4. Document management - list documents</h4>
                <p className="mb-2">Endpoint: <code className="bg-muted py-0.5 px-1 rounded text-xs">GET https://{window.location.host}/api/p/{projectId}/documents</code></p>
                <p className="mb-1">Headers:</p>
                <pre className="bg-muted p-2 rounded text-xs mb-2">
                  X-API-Key: your_api_key
                </pre>
                <p className="mb-1">Response (success):</p>
                <pre className="bg-muted p-2 rounded text-xs">
{`{
  "success": true,
  "documents": [
    {
      "id": 123,
      "filename": "dokument.pdf",
      "content": "Obsah dokumentu...",
      "totalPages": 10,
      "fileSize": 1024000,
      "processingStatus": "completed",
      "processingError": null,
      "createdAt": "2025-08-15T12:00:00Z",
      "processedAt": "2025-08-15T12:01:00Z"
    }
  ]
}`}
                </pre>
              </div>

              <div className="border rounded-md p-3">
                <h4 className="font-medium mb-1">5. Document management - upload a document</h4>
                <p className="mb-2">Endpoint: <code className="bg-muted py-0.5 px-1 rounded text-xs">POST https://{window.location.host}/api/p/{projectId}/documents</code></p>
                <p className="mb-1">Headers:</p>
                <pre className="bg-muted p-2 rounded text-xs mb-2">
                  Content-Type: application/json
                  X-API-Key: your_api_key
                </pre>
                <p className="mb-1">Request body:</p>
                <pre className="bg-muted p-2 rounded text-xs mb-2">
{`{
  "filename": "novy-dokument.pdf",
  "content": "Text content of the document... (plain text)"
}`}
                </pre>
                <p className="text-xs text-muted-foreground mb-2">Note: content must be plain text (PDFs are processed automatically). The API does not accept binary uploads - send the text extracted from the PDF.</p>
                <p className="mb-1">Response (success):</p>
                <pre className="bg-muted p-2 rounded text-xs">
{`{
  "success": true,
  "message": "The document was uploaded and processed successfully",
  "document": {
    "id": 124,
    "filename": "novy-dokument.pdf",
    "processingStatus": "processing"
  }
}`}
                </pre>
              </div>

              <div className="border rounded-md p-3">
                <h4 className="font-medium mb-1">6. Document management - delete a document</h4>
                <p className="mb-2">Endpoint: <code className="bg-muted py-0.5 px-1 rounded text-xs">DELETE https://{window.location.host}/api/p/{projectId}/documents/{'{documentId}'}</code></p>
                <p className="mb-1">Headers:</p>
                <pre className="bg-muted p-2 rounded text-xs mb-2">
                  X-API-Key: your_api_key
                </pre>
                <p className="mb-1">Response (success):</p>
                <pre className="bg-muted p-2 rounded text-xs">
{`{
  "success": true,
  "message": "The document has been deleted"
}`}
                </pre>
              </div>

              <div className="border rounded-md p-3">
                <h4 className="font-medium mb-1">Error responses</h4>
                <p className="mb-1">Error response format:</p>
                <pre className="bg-muted p-2 rounded text-xs">
{`{
  "success": false,
  "error": "Popis chyby",
  "code": "ERROR_CODE" // optional error code
}`}
                </pre>
                <p className="mt-2 text-xs">Common HTTP status codes: 200 (success), 400 (bad request), 401 (unauthorised), 404 (not found), 429 (rate limit exceeded), 500 (internal error)</p>
              </div>
            </div>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}