import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { TrainingOption, ProjectTrainingOptions } from "@shared/schema";

import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { AlertCircle, HelpCircle, Settings } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";

// Validation schema for training options
const trainingOptionsSchema = z.object({
  contextSize: z.coerce.number()
    .min(512, "Context size must be at least 512")
    .max(8192, "Context size must be at most 8192"),
  responseStyle: z.enum(["concise", "detailed", "balanced"]),
  customPromptTemplate: z.string().optional(),
  useKeywordsExtraction: z.boolean().default(true),
  useSemanticSearch: z.boolean().default(true),
  maxDocuments: z.coerce.number()
    .min(1, "Max documents must be at least 1")
    .max(20, "Max documents must be at most 20"),
  documentChunkSize: z.coerce.number()
    .min(500, "Document chunk size must be at least 500")
    .max(2000, "Document chunk size must be at most 2000"),
  enableCitationGeneration: z.boolean().default(false),
  temperatureValue: z.coerce.number()
    .min(0, "Temperature must be at least 0")
    .max(1, "Temperature must be at most 1"),
  customStopWords: z.string().optional(),
});

interface TrainingOptionsProps {
  projectId: number;
  initialOptions?: Partial<ProjectTrainingOptions>;
  onClose?: () => void;
}

export default function TrainingOptions({ projectId, initialOptions, onClose }: TrainingOptionsProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch existing training options
  const { data: options, isLoading } = useQuery({
    queryKey: ["/api/projects", projectId, "training-options"],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/training-options`);
      if (!res.ok) throw new Error("Failed to fetch training options");
      return res.json();
    },
  });

  // Default values for the form
  const defaultOptions: ProjectTrainingOptions = {
    contextSize: 2048,
    responseStyle: "balanced",
    customPromptTemplate: "",
    useKeywordsExtraction: true,
    useSemanticSearch: true,
    maxDocuments: 5,
    documentChunkSize: 1000,
    enableCitationGeneration: false,
    temperatureValue: 0.7,
    customStopWords: "",
  };

  // Mutation for updating training options
  const updateOptionsMutation = useMutation({
    mutationFn: async (options: ProjectTrainingOptions) => {
      const res = await apiRequest("PUT", `/api/projects/${projectId}/training-options`, options);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Training options updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "training-options"] });
      if (onClose) onClose();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: `Failed to update training options: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  // Form setup
  const form = useForm<ProjectTrainingOptions>({
    resolver: zodResolver(trainingOptionsSchema),
    defaultValues: {
      ...defaultOptions,
      ...initialOptions,
      ...options,
    },
  });

  // Handler for form submission
  function onSubmit(values: ProjectTrainingOptions) {
    updateOptionsMutation.mutate(values);
  }

  // If loading, display a loading message
  if (isLoading) {
    return <div className="p-4 text-center">Loading training options...</div>;
  }

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center">
          <Settings className="mr-2 h-5 w-5" />
          Advanced Training Options
        </CardTitle>
        <CardDescription>
          Customize how the AI processes documents and generates responses
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="basic">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="basic">Basic Settings</TabsTrigger>
            <TabsTrigger value="advanced">Advanced Settings</TabsTrigger>
            <TabsTrigger value="expert">Expert Settings</TabsTrigger>
          </TabsList>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 pt-6">
              <TabsContent value="basic" className="space-y-6">
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Response Style</AlertTitle>
                  <AlertDescription>
                    Choose how you want the AI to respond to questions.
                  </AlertDescription>
                </Alert>

                <FormField
                  control={form.control}
                  name="responseStyle"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Response Style</FormLabel>
                      <Select 
                        onValueChange={field.onChange} 
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a response style" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="concise">Concise - Brief and to the point</SelectItem>
                          <SelectItem value="balanced">Balanced - Moderate level of detail</SelectItem>
                          <SelectItem value="detailed">Detailed - Comprehensive explanations</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        How detailed should the AI responses be?
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="temperatureValue"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex justify-between items-center">
                        <FormLabel>Creativity Level</FormLabel>
                        <span className="text-sm text-muted-foreground">
                          {field.value.toFixed(1)}
                        </span>
                      </div>
                      <FormControl>
                        <Slider
                          value={[field.value]}
                          min={0}
                          max={1}
                          step={0.1}
                          onValueChange={(value) => field.onChange(value[0])}
                        />
                      </FormControl>
                      <FormDescription>
                        Low values produce more predictable responses, higher values enable more creativity
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="customPromptTemplate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Custom Instructions (Optional)</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Example: You are a helpful assistant specialized in technical documentation."
                          className="min-h-[100px]"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Provide custom instructions for the AI's personality and behavior
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </TabsContent>

              <TabsContent value="advanced" className="space-y-6">
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Document Processing</AlertTitle>
                  <AlertDescription>
                    Configure how documents are processed and searched.
                  </AlertDescription>
                </Alert>

                <FormField
                  control={form.control}
                  name="maxDocuments"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Maximum Documents to Include</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} />
                      </FormControl>
                      <FormDescription>
                        Maximum number of relevant documents to include in context (1-20)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="documentChunkSize"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Document Chunk Size</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} />
                      </FormControl>
                      <FormDescription>
                        Size of document chunks for processing (500-2000)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="useKeywordsExtraction"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">
                            Use Keywords Extraction
                          </FormLabel>
                          <FormDescription>
                            Improve retrieval by extracting keywords
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="useSemanticSearch"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">
                            Use Semantic Search
                          </FormLabel>
                          <FormDescription>
                            Find documents by meaning, not just keywords
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
              </TabsContent>

              <TabsContent value="expert" className="space-y-6">
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Expert Settings</AlertTitle>
                  <AlertDescription>
                    Advanced settings for fine-tuning AI behavior. These settings are recommended for expert users only.
                  </AlertDescription>
                </Alert>

                <FormField
                  control={form.control}
                  name="contextSize"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Context Size</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} />
                      </FormControl>
                      <FormDescription>
                        Maximum context size in tokens (512-8192)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />



                <FormField
                  control={form.control}
                  name="enableCitationGeneration"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">
                          Cite sources in answers
                        </FormLabel>
                        <FormDescription>
                          The chatbot marks each claim with a number and lists the
                          documents it used underneath the answer. Costs a few extra
                          tokens per question, and only works for projects whose
                          documents have been processed into chunks.
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="customStopWords"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Custom Stop Words (Optional)</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Enter custom stop words separated by commas"
                          className="min-h-[100px]"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Words or phrases that will cause the AI to stop generating text
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </TabsContent>

              <Separator />
              
              <div className="flex justify-end space-x-4">
                {onClose && (
                  <Button variant="outline" onClick={onClose} type="button">
                    Cancel
                  </Button>
                )}
                <Button 
                  type="submit" 
                  disabled={updateOptionsMutation.isPending}
                >
                  {updateOptionsMutation.isPending ? "Saving..." : "Save Settings"}
                </Button>
              </div>
            </form>
          </Form>
        </Tabs>
      </CardContent>
    </Card>
  );
}