import React from "react";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, Settings, ExternalLink } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";

// Validation schema for the embedded chat settings
const embedSettingsSchema = z.object({
  colorTheme: z.string(),
  chatbotName: z.string().min(3, "The chatbot name must be at least 3 characters long").max(50, "The chatbot name can be at most 50 characters long"),
  welcomeMessage: z.string().min(10, "The welcome message must be at least 10 characters long").max(200, "The welcome message can be at most 200 characters long"),
  defaultPrompt: z.string().optional(),
  // Notification settings
  notificationEnabled: z.boolean().default(false),
  notificationDelay: z.number().min(5, "The minimum delay is 5 seconds").max(300, "The maximum delay is 300 seconds"),
  notificationText: z.string().min(5, "The notification text must be at least 5 characters long").max(100, "The notification text can be at most 100 characters long"),
});

type EmbedSettingsValues = z.infer<typeof embedSettingsSchema>;

interface EmbedSettingsProps {
  projectId: number;
  onClose?: () => void;
}

export default function EmbedSettings({ projectId, onClose }: EmbedSettingsProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Load the existing project
  const { data: project, isLoading } = useQuery<Project>({
    queryKey: [`/api/projects/${projectId}`],
    enabled: !!projectId,
  });

  // Mutation for updating the project settings
  const updateProjectMutation = useMutation({
    mutationFn: async (values: EmbedSettingsValues) => {
      const res = await apiRequest("PATCH", `/api/projects/${projectId}`, values);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "The embedded chat settings have been updated",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/embed-code`] });
      if (onClose) onClose();
    },
    onError: (error: Error) => {
      toast({
        title: "Chyba",
        description: `The settings could not be updated: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  // Barvy k dispozici pro chatbota
  const colorOptions = [
    { value: "blue", label: "Blue" },
    { value: "green", label: "Green" },
    { value: "red", label: "Red" },
    { value: "purple", label: "Purple" },
    { value: "orange", label: "Orange" },
    { value: "teal", label: "Teal" },
    { value: "indigo", label: "Indigo" },
    { value: "yellow", label: "Yellow" },
    { value: "pink", label: "Pink" },
    { value: "gray", label: "Gray" },
  ];

  // Form initialisation
  const form = useForm<EmbedSettingsValues>({
    resolver: zodResolver(embedSettingsSchema),
    defaultValues: {
      colorTheme: project?.colorTheme || "blue",
      chatbotName: project?.chatbotName || "DocuSage Assistant",
      welcomeMessage: project?.welcomeMessage || "Hello, how can I help you?",
      defaultPrompt: project?.defaultPrompt || "You are a helpful AI assistant.",
      // Default values for notifications
      notificationEnabled: project?.notificationEnabled ?? false,
      notificationDelay: project?.notificationDelay ?? 15,
      notificationText: project?.notificationText || "Need help with anything?",
    },
    values: project ? {
      colorTheme: project.colorTheme,
      chatbotName: project.chatbotName || "DocuSage Assistant",
      welcomeMessage: project.welcomeMessage || "Hello, how can I help you?",
      defaultPrompt: project.defaultPrompt || "You are a helpful AI assistant.",
      // Notification values from the existing project
      notificationEnabled: project.notificationEnabled ?? false,
      notificationDelay: project.notificationDelay ?? 15,
      notificationText: project.notificationText || "Need help with anything?",
    } : undefined,
  });

  // Handler for form submission
  function onSubmit(values: EmbedSettingsValues) {
    updateProjectMutation.mutate(values);
  }

  // While data is loading, show the loading state
  if (isLoading) {
    return <div className="p-4 text-center">Loading settings...</div>;
  }

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center">
          <Settings className="mr-2 h-5 w-5" />
          Embedded chat settings
        </CardTitle>
        <CardDescription>
          Adjust the appearance and behaviour of the chatbot embedded on your website
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="appearance">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="appearance">Vzhled</TabsTrigger>
            <TabsTrigger value="behavior">Behaviour</TabsTrigger>
          </TabsList>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 pt-6">
              <TabsContent value="appearance" className="space-y-6">
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Appearance</AlertTitle>
                  <AlertDescription>
                    Adjust how your chatbot looks when embedded on a website.
                  </AlertDescription>
                </Alert>

                <FormField
                  control={form.control}
                  name="colorTheme"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Colour theme</FormLabel>
                      <Select 
                        onValueChange={field.onChange} 
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Vyberte barvu" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {colorOptions.map(option => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        The colour affects the chatbot's button and header
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="chatbotName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Chatbot name</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormDescription>
                        This name is shown in the chatbot header
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </TabsContent>

              <TabsContent value="behavior" className="space-y-6">
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Behaviour settings</AlertTitle>
                  <AlertDescription>
                    Adjust how the chatbot responds and which messages it shows.
                  </AlertDescription>
                </Alert>

                <FormField
                  control={form.control}
                  name="welcomeMessage"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Welcome message</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="e.g. Hello, how can I help you?" 
                          className="min-h-[100px]" 
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        This message is shown as the first automatic reply when the chat opens
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="defaultPrompt"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Instrukce pro AI (Osobnost chatbota)</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="e.g. You are a helpful AI assistant specialising in technical documentation." 
                          className="min-h-[100px]" 
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        These instructions shape how the AI answers – they define the chatbot's personality
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="border-t border-gray-100 pt-6 mt-8">
                  <h3 className="text-lg font-medium mb-4">Notification</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Configure the automatic notification shown to visitors who have not started a conversation yet.
                  </p>
                  
                  <FormField
                    control={form.control}
                    name="notificationEnabled"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 mb-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Enable notifications</FormLabel>
                          <FormDescription>
                            When enabled, a notification bubble appears above the chat icon after the configured delay
                          </FormDescription>
                        </div>
                        <FormControl>
                          <input
                            type="checkbox"
                            checked={field.value}
                            onChange={field.onChange}
                            className="scale-125"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="notificationDelay"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Notification delay (seconds)</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            min={5} 
                            max={300} 
                            {...field} 
                            onChange={(e) => field.onChange(parseInt(e.target.value))}
                          />
                        </FormControl>
                        <FormDescription>
                          After how many seconds the notification appears (min. 5, max. 300)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="notificationText"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Notification text</FormLabel>
                        <FormControl>
                          <Input 
                            {...field} 
                            placeholder="e.g. Need help with anything?" 
                          />
                        </FormControl>
                        <FormDescription>
                          The text shown in the notification bubble
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </TabsContent>

              <div className="flex justify-end space-x-4 pt-4">
                {onClose && (
                  <Button variant="outline" onClick={onClose} type="button">
                    Cancel
                  </Button>
                )}
                <Button 
                  type="submit" 
                  disabled={updateProjectMutation.isPending}
                >
                  {updateProjectMutation.isPending ? "Saving..." : "Save settings"}
                </Button>
              </div>
            </form>
          </Form>
          
          <div className="mt-6 pt-4 border-t border-gray-100">
            <p className="text-sm text-muted-foreground flex items-center">
              <ExternalLink className="h-4 w-4 mr-1" />
              You can see how these settings look in the "Embed preview" section on the project page.
            </p>
          </div>
        </Tabs>
      </CardContent>
    </Card>
  );
}