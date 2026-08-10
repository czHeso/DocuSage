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
  Lock
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// Validation schema for the API key
const apiKeySchema = z.object({
  openaiApiKey: z.string()
    .min(1, "The API key is required")
    .refine(val => val.startsWith('sk-'), {
      message: "An OpenAI API key must start with 'sk-'"
    })
});

type ApiKeyFormValues = z.infer<typeof apiKeySchema>;

interface OpenAiApiKeySettingsProps {
  projectId: number;
}

export default function OpenAiApiKeySettings({ projectId }: OpenAiApiKeySettingsProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  // Load the project data
  const { data: project, isLoading } = useQuery<Project>({
    queryKey: [`/api/projects/${projectId}`],
  });

  // Mutation for verifying the OpenAI API key
  const verifyApiKeyMutation = useMutation({
    mutationFn: async (apiKey: string) => {
      const response = await apiRequest("POST", "/api/verify-openai-key", { apiKey });
      return response.json();
    },
    onSuccess: (data) => {
      setVerificationResult({
        success: data.success,
        message: data.message
      });

      if (data.success) {
        toast({
          title: "The API key is valid",
          description: "The OpenAI API key has been verified.",
        });
      } else {
        toast({
          title: "The API key is not valid",
          description: data.message,
          variant: "destructive",
        });
      }
    },
    onError: (error: Error) => {
      setVerificationResult({
        success: false,
        message: error.message,
      });
      toast({
        title: "Verification error",
        description: error.message,
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIsVerifying(false);
    }
  });

  // Mutation for updating the project's API key
  const updateApiKeyMutation = useMutation({
    mutationFn: async (values: ApiKeyFormValues) => {
      await apiRequest("PATCH", `/api/projects/${projectId}`, values);
    },
    onSuccess: () => {
      // Invalidate the cache after a successful update
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/user/projects'] });
      
      toast({
        title: "API key saved",
        description: "The OpenAI API key has been set for this project.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error saving",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Form initialisation
  const form = useForm<ApiKeyFormValues>({
    resolver: zodResolver(apiKeySchema),
    defaultValues: {
      openaiApiKey: "",
    },
    values: project ? {
      openaiApiKey: project.openaiApiKey || "",
    } : undefined,
  });

  // Handler for form submission
  function onSubmit(values: ApiKeyFormValues) {
    // If the API key passed verification, update the project
    if (verificationResult?.success) {
      updateApiKeyMutation.mutate(values);
    } else {
      toast({
        title: "Verify the API key",
        description: "The API key must be verified before it can be saved.",
        variant: "destructive",
      });
    }
  }

  // Handler for API key verification
  function handleVerifyApiKey() {
    const apiKey = form.getValues().openaiApiKey;
    if (!apiKey) {
      toast({
        title: "Missing API key",
        description: "Enter the API key you want to verify.",
        variant: "destructive",
      });
      return;
    }

    setIsVerifying(true);
    setVerificationResult(null);
    verifyApiKeyMutation.mutate(apiKey);
  }

  // Shows the loading indicator while data is loading
  if (isLoading) {
    return <div className="p-4 text-center">Loading the API settings...</div>;
  }

  // Determines whether the project already has an API key set
  const hasApiKey = project?.openaiApiKey && project.openaiApiKey.trim() !== "";

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center">
          <Key className="mr-2 h-5 w-5" />
          OpenAI API key
        </CardTitle>
        <CardDescription>
          Set your own OpenAI API key for generating answers
        </CardDescription>
      </CardHeader>
      <CardContent>
        {hasApiKey && (
          <Alert className="mb-6">
            <Check className="h-4 w-4" />
            <AlertTitle>The API key is set</AlertTitle>
            <AlertDescription>
              This project has its own OpenAI API key. For safety, only part of the key is shown.
            </AlertDescription>
          </Alert>
        )}

        <div className="mb-6">
          <p className="text-sm text-muted-foreground">
            An OpenAI API key is required to use GPT models in this project.
            Setting your own API key means using your own OpenAI account, which gives you reliability and control over API usage.
          </p>
          <div className="mt-2">
            <a 
              href="https://platform.openai.com/api-keys" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="text-sm text-primary flex items-center hover:underline"
            >
              Get an OpenAI API key
              <ExternalLink className="ml-1 h-3 w-3" />
            </a>
          </div>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="openaiApiKey"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>OpenAI API key</FormLabel>
                  <div className="flex">
                    <FormControl>
                      <div className="relative w-full">
                        <Input 
                          placeholder={hasApiKey ? "••••••••••••••••••••••" : "sk-..."}
                          type="password"
                          className="pr-10 font-mono"
                          {...field}
                        />
                        <Lock className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      </div>
                    </FormControl>
                  </div>
                  <FormDescription>
                    The API key is stored securely and used only for this project. It starts with the "sk-" prefix.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="mt-3">
              {verificationResult && (
                <Alert variant={verificationResult.success ? "default" : "destructive"} className="mb-4">
                  {verificationResult.success ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <AlertCircle className="h-4 w-4" />
                  )}
                  <AlertTitle>
                    {verificationResult.success ? "API key verified" : "Invalid API key"}
                  </AlertTitle>
                  <AlertDescription>
                    {verificationResult.message}
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex space-x-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleVerifyApiKey}
                  disabled={isVerifying}
                  className="flex-1"
                >
                  {isVerifying ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    "Verify API key"
                  )}
                </Button>
                <Button
                  type="submit"
                  disabled={updateApiKeyMutation.isPending || !verificationResult?.success}
                  className="flex-1"
                >
                  {updateApiKeyMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save API key"
                  )}
                </Button>
              </div>
            </div>
          </form>
        </Form>

        <div className="mt-6 pt-4 border-t border-gray-100">
          <p className="text-sm text-muted-foreground">
            <AlertCircle className="inline-block h-4 w-4 mr-1" />
            Using an API key may incur charges on your OpenAI account. Check your
            <a 
              href="https://platform.openai.com/usage" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="text-primary hover:underline mx-1"
            >
              usage and charges
            </a>
            on your OpenAI account.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}