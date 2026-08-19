import React, { useState, useRef } from "react";
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
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, Settings, Brain, ExternalLink, MessageSquare, Code2, Upload, X, ImageIcon, Trash2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";

// Validation schema for the chatbot settings
const chatbotSettingsSchema = z.object({
  colorTheme: z.string(),
  chatbotName: z.string().min(3, "The chatbot name must be at least 3 characters long").max(50, "The chatbot name can be at most 50 characters long"),
  welcomeMessage: z.string().min(10, "The welcome message must be at least 10 characters long").max(200, "The welcome message can be at most 200 characters long"),
  defaultPrompt: z.string().min(10, "The prompt must be at least 10 characters long").max(1000, "The prompt must not be longer than 1000 characters"),
  // Add the notification fields
  notificationEnabled: z.boolean().default(false),
  notificationDelay: z.number().min(5, "The minimum delay is 5 seconds").max(300, "The maximum delay is 300 seconds"),
  notificationText: z.string().min(5, "The notification text must be at least 5 characters long").max(100, "The notification text can be at most 100 characters long"),
  // Add the disclaimer text field
  embedDisclaimer: z.string().min(10, "The disclaimer text must be at least 10 characters long").max(200, "The disclaimer text can be at most 200 characters long"),
  // Option to hide the "Powered by" text
  hidePoweredBy: z.boolean().default(false),
  // Conversation rating settings
  ratingEnabled: z.boolean().default(true),
  ratingPromptMessage: z.string().min(10, "The rating prompt must be at least 10 characters long").max(100, "The rating prompt can be at most 100 characters long"),
  ratingThankYouMessage: z.string().min(10, "The thank-you message must be at least 10 characters long").max(100, "The thank-you message can be at most 100 characters long"),
  // Where the widget may run, and how much it may cost. Both empty/zero by
  // default, which is the behaviour every existing project already has.
  allowedDomains: z.string().max(1000),
  monthlyMessageLimit: z.coerce.number().int().min(0, "Use 0 for no limit"),
});

type ChatbotSettingsValues = z.infer<typeof chatbotSettingsSchema>;

interface ChatbotSettingsProps {
  projectId: number;
  onClose?: () => void;
}

export default function ChatbotSettings({ projectId, onClose }: ChatbotSettingsProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingIcon, setIsUploadingIcon] = useState(false);

  // Load the project data
  const { data: project, isLoading } = useQuery<Project>({
    queryKey: [`/api/projects/${projectId}`],
  });
  
  // Mutation for updating the project settings
  const updateProjectMutation = useMutation({
    mutationFn: async (values: ChatbotSettingsValues) => {
      await apiRequest("PATCH", `/api/projects/${projectId}`, values);
    },
    onSuccess: () => {
      // Invalidate all relevant caches after a successful update
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/embed-code`] });
      
      // Invalidate the global project cache so every component refreshes
      queryClient.invalidateQueries({ queryKey: ['/api/user/projects'] });
      
      // Force the preview to refresh
      setTimeout(() => {
        const previewTab = document.querySelector('[value="preview"]');
        if (previewTab) {
          const currentTab = document.querySelector('[data-state="active"]');
          if (currentTab && currentTab.getAttribute('value') === 'preview') {
            // We are on the preview tab, so trigger a click on the load-preview button
            const previewButton = document.querySelector('.bg-white');
            if (previewButton) {
              (previewButton as HTMLButtonElement).click();
            }
          }
        }
      }, 500);
      
      toast({
        title: "Settings saved",
        description: "The chatbot settings have been updated.",
      });
      
      if (onClose) onClose();
    },
    onError: (error: Error) => {
      toast({
        title: "Error saving",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Mutation for uploading the bot icon
  const uploadIconMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('icon', file);
      
      const response = await fetch(`/api/projects/${projectId}/bot-icon`, {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Error uploading the icon');
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}`] });
      toast({
        title: "Icon uploaded",
        description: "The bot icon has been uploaded.",
      });
      setIsUploadingIcon(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Chyba",
        description: error.message || "The bot icon could not be uploaded.",
        variant: "destructive",
      });
      setIsUploadingIcon(false);
    },
  });

  // Mutation for deleting the bot icon
  const deleteIconMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/projects/${projectId}/bot-icon`, {
        method: 'DELETE',
        credentials: 'include'
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Error deleting the icon');
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}`] });
      toast({
        title: "Icon deleted",
        description: "The bot icon has been deleted.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Chyba",
        description: error.message || "The bot icon could not be deleted.",
        variant: "destructive",
      });
    },
  });

  // Handler for file upload
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        toast({
          title: "The file is too large",
          description: "The maximum icon size is 2 MB.",
          variant: "destructive",
        });
        return;
      }
      
      if (!file.type.startsWith('image/')) {
        toast({
          title: "Invalid file type",
          description: "Only images can be uploaded (PNG, JPG, GIF, SVG).",
          variant: "destructive",
        });
        return;
      }
      
      setIsUploadingIcon(true);
      uploadIconMutation.mutate(file);
    }
  };

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
  const form = useForm<ChatbotSettingsValues>({
    resolver: zodResolver(chatbotSettingsSchema),
    defaultValues: {
      colorTheme: project?.colorTheme || "blue",
      chatbotName: project?.chatbotName || "DocuSage Assistant",
      welcomeMessage: project?.welcomeMessage || "Hi, feel free to ask a question here",
      defaultPrompt: project?.defaultPrompt || "You are a helpful AI assistant.",
      // Default notification values
      notificationEnabled: project?.notificationEnabled ?? false,
      notificationDelay: project?.notificationDelay ?? 15,
      notificationText: project?.notificationText || "Need help with anything?",
      // Default value for the disclaimer text
      embedDisclaimer: project?.embedDisclaimer || "Answers are generated by AI and may not always be accurate",
      hidePoweredBy: project?.hidePoweredBy ?? false,
      // Default rating values
      ratingEnabled: project?.ratingEnabled ?? true,
      ratingPromptMessage: project?.ratingPromptMessage || "Please rate our conversation",
      ratingThankYouMessage: project?.ratingThankYouMessage || "Thank you for your rating!",
      allowedDomains: project?.allowedDomains || "",
      monthlyMessageLimit: project?.monthlyMessageLimit ?? 0,
    },
    values: project ? {
      colorTheme: project.colorTheme || "blue",
      chatbotName: project.chatbotName || "DocuSage Assistant",
      welcomeMessage: project.welcomeMessage || "Hi, feel free to ask a question here",
      defaultPrompt: project.defaultPrompt || "You are a helpful AI assistant.",
      // Notification values from the existing project
      notificationEnabled: project.notificationEnabled ?? false,
      notificationDelay: project.notificationDelay ?? 15,
      notificationText: project.notificationText || "Need help with anything?",
      // Disclaimer text value from the existing project
      embedDisclaimer: project.embedDisclaimer || "Answers are generated by AI and may not always be accurate",
      hidePoweredBy: project.hidePoweredBy ?? false,
      // Rating values from the existing project
      ratingEnabled: project.ratingEnabled ?? true,
      ratingPromptMessage: project.ratingPromptMessage || "Please rate our conversation",
      ratingThankYouMessage: project.ratingThankYouMessage || "Thank you for your rating!",
      allowedDomains: project.allowedDomains || "",
      monthlyMessageLimit: project.monthlyMessageLimit ?? 0,
    } : undefined,
  });

  // Handler for form submission
  function onSubmit(values: ChatbotSettingsValues) {
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
          <Brain className="mr-2 h-5 w-5" />
          Chatbot settings
        </CardTitle>
        <CardDescription>
          Configure your chatbot's behaviour, appearance, and other properties
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="personality">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="personality" className="flex items-center">
              <Brain className="mr-2 h-4 w-4" />
              Osobnost
            </TabsTrigger>
            <TabsTrigger value="appearance" className="flex items-center">
              <Settings className="mr-2 h-4 w-4" />
              Vzhled
            </TabsTrigger>
            <TabsTrigger value="messages" className="flex items-center">
              <MessageSquare className="mr-2 h-4 w-4" />
              Messages
            </TabsTrigger>
          </TabsList>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 pt-6">
              <TabsContent value="personality" className="space-y-6">
                <Alert>
                  <Brain className="h-4 w-4" />
                  <AlertTitle>Osobnost chatbota</AlertTitle>
                  <AlertDescription>
                    Configure how your chatbot behaves and talks to users.
                  </AlertDescription>
                </Alert>

                <FormField
                  control={form.control}
                  name="defaultPrompt"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Default Prompt</FormLabel>
                      <FormControl>
                        <Textarea 
                          className="min-h-[120px] font-mono text-sm"
                          placeholder="You are a helpful AI assistant." 
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Write the instructions that define how the chatbot should behave. For example: "You are a helpful chatbot assistant for the XYZ online store. Be humorous and use emoji. If you do not know an answer, apologise and say you cannot help with that."
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </TabsContent>

              <TabsContent value="appearance" className="space-y-6">
                <Alert>
                  <Settings className="h-4 w-4" />
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

                <FormField
                  control={form.control}
                  name="embedDisclaimer"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Disclaimer text</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="e.g. Answers are generated by AI and may not always be accurate" 
                          className="min-h-[80px]" 
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        This text is shown at the bottom of the chatbot as a disclaimer
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="hidePoweredBy"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">
                          Hide the "Powered by" text
                        </FormLabel>
                        <FormDescription>
                          Hides the "Powered by DocuSage" text in the chatbot
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

                {/* Section for uploading the bot icon */}
                <div className="space-y-4">
                  <div className="border-t border-gray-100 pt-6 mt-8">
                    <h3 className="text-lg font-medium mb-2 flex items-center">
                      <ImageIcon className="h-5 w-5 mr-2" />
                      Ikonka bota
                    </h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Upload a custom icon shown next to the bot name, and optionally next to its chat messages.
                    </p>

                    <div className="flex items-start space-x-4">
                      {/* Current icon */}
                      <div className="flex-shrink-0">
                        {project?.botIconUrl ? (
                          <div className="w-16 h-16 border-2 border-gray-200 rounded-lg overflow-hidden bg-white">
                            <img 
                              src={project.botIconUrl} 
                              alt="Ikonka bota" 
                              className="w-full h-full object-cover"
                            />
                          </div>
                        ) : (
                          <div className="w-16 h-16 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center bg-gray-50">
                            <ImageIcon className="h-8 w-8 text-gray-400" />
                          </div>
                        )}
                      </div>

                      {/* Buttons for managing the icon */}
                      <div className="flex-1 space-y-2">
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isUploadingIcon || uploadIconMutation.isPending}
                            className="flex items-center"
                          >
                            {isUploadingIcon || uploadIconMutation.isPending ? (
                              <>
                                <div className="w-4 h-4 border-2 border-current border-t-transparent animate-spin rounded-full mr-2" />
                                Uploading...
                              </>
                            ) : (
                              <>
                                <Upload className="h-4 w-4 mr-2" />
                                Upload icon
                              </>
                            )}
                          </Button>

                          {project?.botIconUrl && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => deleteIconMutation.mutate()}
                              disabled={deleteIconMutation.isPending}
                              className="flex items-center text-red-600 hover:text-red-700"
                            >
                              {deleteIconMutation.isPending ? (
                                <>
                                  <div className="w-4 h-4 border-2 border-current border-t-transparent animate-spin rounded-full mr-2" />
                                  Deleting...
                                </>
                              ) : (
                                <>
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Smazat
                                </>
                              )}
                            </Button>
                          )}
                        </div>

                        <p className="text-xs text-muted-foreground">
                          Supported formats: PNG, JPG, GIF, SVG. Maximum size: 2 MB.
                        </p>
                        
                        {/* Hidden input for file selection */}
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handleFileUpload}
                          className="hidden"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Section for the rating settings */}
                <div className="border-t border-gray-100 pt-6 mt-8">
                  <h3 className="text-lg font-medium mb-4">Conversation rating</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Configure the star rating shown when a conversation is closed.
                  </p>
                  
                  <FormField
                    control={form.control}
                    name="ratingEnabled"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 mb-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Enable rating</FormLabel>
                          <FormDescription>
                            When enabled, users can rate the conversation from 1 to 5 stars as they close the chat
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

                {/* Section for limiting where and how much the widget runs */}
                <div className="border-t border-gray-100 pt-6 mt-8">
                  <h3 className="text-lg font-medium mb-4">Limits</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    The widget's token is visible in the page source of every site
                    that embeds it, so anyone who views source can run your chatbot
                    on their own page — at your provider's expense. Both settings
                    below are off by default.
                  </p>

                  <FormField
                    control={form.control}
                    name="allowedDomains"
                    render={({ field }) => (
                      <FormItem className="mb-4">
                        <FormLabel>Allowed domains</FormLabel>
                        <FormControl>
                          <Textarea
                            rows={2}
                            placeholder="example.com, *.example.org"
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          Comma-separated. Empty means any domain. A bare
                          <code className="mx-1">example.com</code> also covers
                          <code className="mx-1">www.example.com</code>; use
                          <code className="mx-1">*.example.com</code> for all
                          subdomains. Once set, a page opened straight from a file
                          is refused too.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="monthlyMessageLimit"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Messages per month</FormLabel>
                        <FormControl>
                          <Input type="number" min={0} {...field} />
                        </FormControl>
                        <FormDescription>
                          0 means no limit. Counts visitor messages in the current
                          calendar month, not the chatbot's replies. This is the
                          backstop behind the per-address rate limit, which does
                          nothing against traffic spread over many addresses.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </TabsContent>

              <TabsContent value="messages" className="space-y-6">
                <Alert>
                  <MessageSquare className="h-4 w-4" />
                  <AlertTitle>Message settings</AlertTitle>
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
                          placeholder="e.g. Hi, feel free to ask a question here" 
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

                <div className="border-t border-gray-100 pt-6 mt-8">
                  <h3 className="text-lg font-medium mb-4">Notification</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Configure the automatic notification shown to visitors who have not started a conversation yet.
                  </p>
                  
                  <div className="bg-amber-50 border-l-4 border-amber-500 p-4 mb-6">
                    <p className="text-amber-800 text-sm">
                      <strong>Note:</strong> These settings apply only to the embedded chatbot and are also available in the "Embed snippet" section on the project page, under the "Behaviour" tab.
                    </p>
                  </div>

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

                {/* Section for the rating messages */}
                <div className="border-t border-gray-100 pt-6 mt-8">
                  <h3 className="text-lg font-medium mb-4">Rating messages</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Configure the messages shown during the star rating.
                  </p>

                  <FormField
                    control={form.control}
                    name="ratingPromptMessage"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Rating prompt</FormLabel>
                        <FormControl>
                          <Input 
                            {...field} 
                            placeholder="e.g. Please rate our conversation" 
                          />
                        </FormControl>
                        <FormDescription>
                          This message is shown when the chat closes, before the stars
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="ratingThankYouMessage"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Thank-you message</FormLabel>
                        <FormControl>
                          <Input 
                            {...field} 
                            placeholder="e.g. Thank you for your rating!" 
                          />
                        </FormControl>
                        <FormDescription>
                          This message is shown after the star rating
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
              <Code2 className="h-4 w-4 mr-1" />
              The generated embed snippet updates automatically to match these settings.
            </p>
          </div>
        </Tabs>
      </CardContent>
    </Card>
  );
}