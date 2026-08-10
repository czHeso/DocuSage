import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useToast } from "@/hooks/use-toast";
import { maskApiKey } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { EyeIcon, EyeOffIcon, Loader2 } from "lucide-react";

// Form schema
const formSchema = z.object({
  apiKey: z
    .string()
    .refine(val => val === '' || /^sk_ant_[a-zA-Z0-9_-]{32,}$/.test(val), {
      message: "Invalid API key format. It should start with 'sk_ant_' and be at least 39 characters long.",
    }),
});

type FormValues = z.infer<typeof formSchema>;

interface ApiKeyFormProps {
  currentApiKey: string;
  onSave: (apiKey: string) => void;
  isSaving: boolean;
}

export default function ApiKeyForm({ currentApiKey, onSave, isSaving }: ApiKeyFormProps) {
  const [showApiKey, setShowApiKey] = useState(false);
  const { toast } = useToast();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      apiKey: currentApiKey || "",
    },
  });

  const onSubmit = (values: FormValues) => {
    onSave(values.apiKey);
  };

  const toggleShowApiKey = () => {
    setShowApiKey(!showApiKey);
  };

  return (
    <Card className="shadow overflow-hidden">
      <CardHeader>
        <CardTitle>Anthropic API key (optional)</CardTitle>
        <CardDescription>
          <span className="block mb-2"><span className="font-semibold text-blue-600">Novinka:</span> The system uses a local AI model, so an Anthropic API key is not required.</span>
          <span className="block">For better results you can supply your own Anthropic Claude API key.</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="border-t border-gray-200 p-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="apiKey"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>API key</FormLabel>
                  <div className="relative">
                    <FormControl>
                      <div className="flex">
                        <Input
                          type={showApiKey ? "text" : "password"}
                          className="rounded-r-none"
                          placeholder="sk_ant_..."
                          {...field}
                          value={field.value || ""}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          className="rounded-l-none border-l-0"
                          onClick={toggleShowApiKey}
                        >
                          {showApiKey ? (
                            <EyeOffIcon className="h-4 w-4" />
                          ) : (
                            <EyeIcon className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </FormControl>
                    <FormDescription>
                      You can find your API key at{" "}
                      <a
                        href="https://console.anthropic.com/settings/keys" 
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary underline"
                      >
                        Anthropic konzoli
                      </a>
                    </FormDescription>
                    <FormMessage />
                  </div>
                </FormItem>
              )}
            />
            <Button type="submit" disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save key"
              )}
            </Button>
          </form>
        </Form>
        {currentApiKey && (
          <div className="mt-4 p-3 bg-gray-50 rounded-md">
            <p className="text-sm text-gray-600">
              <span className="font-medium">API key status:</span>{" "}
              <span className="text-green-600">Nastaven</span> ({maskApiKey(currentApiKey)})
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}