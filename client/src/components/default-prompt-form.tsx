import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useToast } from "@/hooks/use-toast";
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
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

// Form schema
const formSchema = z.object({
  defaultPrompt: z
    .string()
    .min(10, {
      message: "The prompt must be at least 10 characters long.",
    })
    .max(1000, {
      message: "The prompt must not be longer than 1000 characters.",
    }),
});

type FormValues = z.infer<typeof formSchema>;

interface DefaultPromptFormProps {
  currentPrompt: string;
  onSave: (prompt: string) => void;
  isSaving: boolean;
}

export default function DefaultPromptForm({ currentPrompt, onSave, isSaving }: DefaultPromptFormProps) {
  const { toast } = useToast();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      defaultPrompt: currentPrompt || "You are a helpful AI assistant.",
    },
  });

  const onSubmit = (values: FormValues) => {
    onSave(values.defaultPrompt);
  };

  return (
    <Card className="shadow overflow-hidden">
      <CardHeader>
        <CardTitle>Osobnost chatbota</CardTitle>
        <CardDescription>
          <span className="block mb-2">Configure how your chatbot behaves and talks to users.</span>
          <span className="block">This setting defines your chatbot's core personality and communication style.</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="border-t border-gray-200 p-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="defaultPrompt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Default Prompt</FormLabel>
                  <div className="relative">
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
                "Save settings"
              )}
            </Button>
          </form>
        </Form>
        {currentPrompt && currentPrompt !== "You are a helpful AI assistant." && (
          <div className="mt-4 p-3 bg-gray-50 rounded-md">
            <p className="text-sm text-gray-600">
              <span className="font-medium">Stav:</span>{" "}
              <span className="text-green-600">Custom personality set</span>
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}