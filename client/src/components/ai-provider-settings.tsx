import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Project } from "@shared/schema";

import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import {
  Check,
  AlertCircle,
  Key,
  Loader2,
  ExternalLink,
  Lock,
  EyeIcon,
  EyeOffIcon,
  Info,
  Clock,
  DollarSign,
  Zap
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

// Definition of the available AI models for each provider, with details
const AI_MODELS = {
  openai: [
    { 
      value: "gpt-4", 
      label: "GPT-4",
      description: "Most capable model with excellent reasoning and complex task handling. Higher cost but best quality.",
      performance: "Excellent",
      speed: "Slow",
      cost: "High"
    },
    { 
      value: "gpt-4-turbo", 
      label: "GPT-4 Turbo",
      description: "Faster version of GPT-4 with 128k context window. Great balance of quality and speed.",
      performance: "Excellent", 
      speed: "Fast",
      cost: "Medium"
    },
    { 
      value: "gpt-3.5-turbo", 
      label: "GPT-3.5 Turbo",
      description: "Fast and cost-effective model suitable for most conversational tasks. Good for high-volume usage.",
      performance: "Good",
      speed: "Very Fast", 
      cost: "Low"
    }
  ],
  google: [
    { 
      value: "gemini-pro", 
      label: "Gemini Pro",
      description: "Google's flagship model with strong reasoning capabilities and multimodal support.",
      performance: "Excellent",
      speed: "Fast", 
      cost: "Medium"
    },
    { 
      value: "gemini-1.5-pro", 
      label: "Gemini 1.5 Pro",
      description: "Latest Gemini model with 2M token context window. Best for long document analysis.",
      performance: "Excellent",
      speed: "Medium",
      cost: "Medium"
    },
    { 
      value: "palm-2", 
      label: "PaLM 2",
      description: "Google's previous generation model. Reliable but less capable than Gemini models.",
      performance: "Good",
      speed: "Fast",
      cost: "Low"
    }
  ],
  azure: [
    { 
      value: "gpt-35-turbo", 
      label: "GPT-3.5 Turbo",
      description: "Cost-effective Azure model ideal for production chatbots with high volume.",
      performance: "Good",
      speed: "Very Fast",
      cost: "Low"
    },
    { 
      value: "gpt-4", 
      label: "GPT-4",
      description: "Enterprise-grade GPT-4 with enhanced security and compliance features.",
      performance: "Excellent",
      speed: "Slow",
      cost: "High"
    },
    { 
      value: "gpt-4-32k", 
      label: "GPT-4 32K",
      description: "GPT-4 with extended 32k token context window for longer conversations.",
      performance: "Excellent",
      speed: "Slow",
      cost: "Very High"
    }
  ]
};

// Validation schema
const aiProviderSchema = z.object({
  aiProvider: z.enum(['openai', 'google', 'azure'], {
    required_error: "Vyberte AI poskytovatele"
  }),
  aiModel: z.string().min(1, "Vyberte model"),
  openaiApiKey: z.string().optional(),
  azureEndpoint: z.string().url("Invalid URL").optional().or(z.literal("")),
}).superRefine((data, ctx) => {
  // The API key is required for all providers
  if (!data.openaiApiKey || data.openaiApiKey.trim() === "") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "The API key is required",
      path: ["openaiApiKey"]
    });
  }

  // For OpenAI we check the key format
  if (data.aiProvider === 'openai' && data.openaiApiKey && !data.openaiApiKey.startsWith('sk-')) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "An OpenAI API key must start with 'sk-'",
      path: ["openaiApiKey"]
    });
  }

  // For Azure the endpoint is mandatory
  if (data.aiProvider === 'azure' && (!data.azureEndpoint || data.azureEndpoint.trim() === "")) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "The Azure endpoint is required",
      path: ["azureEndpoint"]
    });
  }
});

type AiProviderFormValues = z.infer<typeof aiProviderSchema>;

interface AiProviderSettingsProps {
  projectId: number;
}

export default function AiProviderSettings({ projectId }: AiProviderSettingsProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showApiKey, setShowApiKey] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  // Load the project data
  const { data: project, isLoading } = useQuery<Project>({
    queryKey: [`/api/projects/${projectId}`],
  });

  const form = useForm<AiProviderFormValues>({
    resolver: zodResolver(aiProviderSchema),
    defaultValues: {
      aiProvider: project?.aiProvider || "openai",
      aiModel: project?.aiModel || "gpt-4",
      openaiApiKey: project?.openaiApiKey || "",
      azureEndpoint: project?.azureEndpoint || "",
    },
  });

  // Watch for provider changes in order to reset the model
  const selectedProvider = form.watch("aiProvider");

  React.useEffect(() => {
    if (project) {
      console.log('🔧 Loading project data into the form:', { 
        aiProvider: project.aiProvider, 
        aiModel: project.aiModel,
        hasOpenaiKey: !!project.openaiApiKey,
        azureEndpoint: project.azureEndpoint 
      });
      form.reset({
        aiProvider: project.aiProvider || "openai",
        aiModel: project.aiModel || "gpt-4",
        openaiApiKey: project.openaiApiKey || "",
        azureEndpoint: project.azureEndpoint || "",
      });
      setInitialProviderSet(true); // Mark the initial data as set
    }
  }, [project, form]);

  // Reset the model when the provider changes (but not on the initial load)
  const [initialProviderSet, setInitialProviderSet] = React.useState(false);
  
  React.useEffect(() => {
    if (selectedProvider && initialProviderSet) {
      const availableModels = AI_MODELS[selectedProvider as keyof typeof AI_MODELS];
      if (availableModels && availableModels.length > 0) {
        form.setValue("aiModel", availableModels[0].value);
      }
    }
  }, [selectedProvider, form, initialProviderSet]);

  // Mutation for verifying the API key
  const verifyApiKeyMutation = useMutation({
    mutationFn: async (data: { provider: string; apiKey: string; endpoint?: string }) => {
      const response = await apiRequest("POST", "/api/verify-ai-provider", data);
      return response.json();
    },
    onSuccess: (data) => {
      setVerificationResult({
        success: data.success,
        message: data.message
      });
      if (data.success) {
        toast({
          title: "Success",
          description: "The API key is valid and working",
        });
      }
    },
    onError: (error: any) => {
      setVerificationResult({
        success: false,
        message: error.message || "Error verifying the API key"
      });
    },
  });

  // Mutation for saving the settings
  const updateSettingsMutation = useMutation({
    mutationFn: async (data: AiProviderFormValues) => {
      const response = await apiRequest("PATCH", `/api/projects/${projectId}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}`] });
      toast({
        title: "Saved",
        description: "The AI provider settings have been saved",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Chyba",
        description: error.message || "The settings could not be saved",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: AiProviderFormValues) => {
    updateSettingsMutation.mutate(data);
  };

  const handleVerifyApiKey = () => {
    const values = form.getValues();
    if (!values.openaiApiKey) {
      toast({
        title: "Chyba",
        description: "Enter an API key before verifying",
        variant: "destructive",
      });
      return;
    }

    setIsVerifying(true);
    verifyApiKeyMutation.mutate({
      provider: values.aiProvider,
      apiKey: values.openaiApiKey,
      endpoint: values.azureEndpoint
    });
    setIsVerifying(false);
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-6">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  const availableModels = selectedProvider ? AI_MODELS[selectedProvider as keyof typeof AI_MODELS] : [];

  return (
    <TooltipProvider>
      <Card className="shadow overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center">
            <Key className="mr-2 h-5 w-5" />
            AI Poskytovatel a Model
          </CardTitle>
          <CardDescription>
            Choose an AI provider and model, and enter the API key used to generate the chatbot's answers. Hover over a model for details on performance, speed, and cost.
          </CardDescription>
        </CardHeader>
        <CardContent className="border-t border-gray-200 p-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* AI provider selection */}
            <FormField
              control={form.control}
              name="aiProvider"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>AI Poskytovatel</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Vyberte AI poskytovatele" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="openai">OpenAI</SelectItem>
                      <SelectItem value="google">Google</SelectItem>
                      <SelectItem value="azure">SelfHosted Azure OpenAI</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Model selection with detailed tooltips */}
            <FormField
              control={form.control}
              name="aiModel"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Model</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Vyberte model" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {availableModels.map((model) => (
                        <SelectItem key={model.value} value={model.value} className="cursor-pointer">
                          <div className="flex items-center justify-between w-full">
                            <span className="flex-1">{model.label}</span>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Info className="h-3 w-3 text-gray-400 ml-2" />
                              </TooltipTrigger>
                              <TooltipContent side="left" className="max-w-sm">
                                <div className="space-y-2">
                                  <p className="font-medium">{model.label}</p>
                                  <p className="text-sm text-gray-600">{model.description}</p>
                                  <div className="flex gap-2 flex-wrap">
                                    <Badge 
                                      variant={model.performance === "Excellent" ? "default" : "secondary"}
                                      className="text-xs"
                                    >
                                      <Zap className="h-3 w-3 mr-1" />
                                      {model.performance}
                                    </Badge>
                                    <Badge 
                                      variant={model.speed === "Very Fast" ? "default" : model.speed === "Fast" ? "secondary" : "outline"}
                                      className="text-xs"
                                    >
                                      <Clock className="h-3 w-3 mr-1" />
                                      {model.speed}
                                    </Badge>
                                    <Badge 
                                      variant={model.cost === "Low" ? "default" : model.cost === "Medium" ? "secondary" : "destructive"}
                                      className="text-xs"
                                    >
                                      <DollarSign className="h-3 w-3 mr-1" />
                                      {model.cost}
                                    </Badge>
                                  </div>
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                  
                  {/* Model comparison info below select */}
                  {field.value && (
                    <div className="mt-2 p-3 bg-gray-50 rounded-md">
                      {(() => {
                        const selectedModel = availableModels.find(m => m.value === field.value);
                        return selectedModel ? (
                          <div className="space-y-2">
                            <p className="text-sm font-medium text-gray-700">{selectedModel.label} - Selected Model</p>
                            <p className="text-xs text-gray-600">{selectedModel.description}</p>
                            <div className="flex gap-2 flex-wrap">
                              <Badge variant="outline" className="text-xs">
                                <Zap className="h-3 w-3 mr-1" />
                                Performance: {selectedModel.performance}
                              </Badge>
                              <Badge variant="outline" className="text-xs">
                                <Clock className="h-3 w-3 mr-1" />
                                Speed: {selectedModel.speed}
                              </Badge>
                              <Badge variant="outline" className="text-xs">
                                <DollarSign className="h-3 w-3 mr-1" />
                                Cost: {selectedModel.cost}
                              </Badge>
                            </div>
                          </div>
                        ) : null;
                      })()}
                    </div>
                  )}
                </FormItem>
              )}
            />

            {/* Azure endpoint (pouze pro Azure) */}
            {selectedProvider === 'azure' && (
              <FormField
                control={form.control}
                name="azureEndpoint"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Azure OpenAI Endpoint</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="https://your-resource.openai.azure.com"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      The URL of your Azure OpenAI resource endpoint
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* API key */}
            <FormField
              control={form.control}
              name="openaiApiKey"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>API key</FormLabel>
                  <div className="flex space-x-2">
                    <div className="flex-1 relative">
                      <FormControl>
                        <Input
                          type={showApiKey ? "text" : "password"}
                          placeholder={
                            selectedProvider === 'openai' ? "sk-..." :
                            selectedProvider === 'google' ? "AIza..." :
                            "API key..."
                          }
                          {...field}
                        />
                      </FormControl>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6"
                        onClick={() => setShowApiKey(!showApiKey)}
                      >
                        {showApiKey ? (
                          <EyeOffIcon className="h-4 w-4" />
                        ) : (
                          <EyeIcon className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleVerifyApiKey}
                      disabled={isVerifying || verifyApiKeyMutation.isPending}
                    >
                      {isVerifying || verifyApiKeyMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "Verify"
                      )}
                    </Button>
                  </div>
                  <FormDescription>
                    {selectedProvider === 'openai' && (
                      <>You can find your API key at <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">the OpenAI platform</a></>
                    )}
                    {selectedProvider === 'google' && (
                      <>You can find your API key in <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Google Cloud Console</a></>
                    )}
                    {selectedProvider === 'azure' && (
                      <>You can find your API key in your Azure OpenAI resource</>
                    )}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Verification result */}
            {verificationResult && (
              <Alert variant={verificationResult.success ? "default" : "destructive"}>
                {verificationResult.success ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <AlertCircle className="h-4 w-4" />
                )}
                <AlertTitle>
                  {verificationResult.success ? "The API key is valid" : "Problem with the API key"}
                </AlertTitle>
                <AlertDescription>
                  {verificationResult.message}
                </AlertDescription>
              </Alert>
            )}

            {/* Action buttons */}
            <div className="flex space-x-3">
              <Button 
                type="submit" 
                disabled={updateSettingsMutation.isPending}
                className="flex-1"
              >
                {updateSettingsMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save settings"
                )}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
    </TooltipProvider>
  );
}