import { useState, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Brain, Send, Bot, Cpu, Sparkles, Loader2 } from "lucide-react";
import { ChatMessage } from "@shared/schema";

interface ChatInterfaceProps {
  projectId: number;
  sessionId: number | null;
  onSessionCreated: (sessionId: number) => void;
}

interface Message {
  content: string;
  isFromUser: boolean;
  timestamp: Date;
}

interface ChatResponse {
  message: ChatMessage;
  sessionId: number;
}

// Component animating the loading of an AI answer
function AnimatedAITyping() {
  // Reference pro animaci
  const [animationStep, setAnimationStep] = useState(0);

  // Rotating icons for the animation
  const icons = [Brain, Bot, Cpu, Sparkles];
  const CurrentIcon = icons[animationStep % icons.length];
  
  // Texty pro animaci
  const loadingTexts = [
    "The AI is thinking...",
    "Generating an answer...",
    "Processing data...",
    "Looking for the best answer..."
  ];
  
  // Efekt pro animaci
  useEffect(() => {
    const interval = setInterval(() => {
      setAnimationStep(prev => (prev + 1) % icons.length);
    }, 800);
    
    return () => clearInterval(interval);
  }, []);
  
  return (
    <div className="flex items-start animate-pulse">
      <div className="flex-shrink-0 mr-3">
        <div className="h-8 w-8 rounded-full bg-primary-100 flex items-center justify-center">
          <CurrentIcon className="h-5 w-5 text-primary-500" />
        </div>
      </div>
      <div className="bg-gray-100 text-gray-600 p-3 rounded-lg max-w-xs md:max-w-md lg:max-w-lg">
        <div className="flex items-center space-x-2">
          <div className="h-2 w-2 rounded-full bg-primary-400 animate-bounce" style={{ animationDelay: "0ms" }}></div>
          <div className="h-2 w-2 rounded-full bg-primary-500 animate-bounce" style={{ animationDelay: "300ms" }}></div>
          <div className="h-2 w-2 rounded-full bg-primary-600 animate-bounce" style={{ animationDelay: "600ms" }}></div>
        </div>
        <p className="text-sm mt-2">{loadingTexts[animationStep]}</p>
      </div>
    </div>
  );
}

export default function ChatInterface({ projectId, sessionId, onSessionCreated }: ChatInterfaceProps) {
  // Debug log for the project ID
  console.log("Chat Interface - Project ID:", projectId, "Type:", typeof projectId, "Valid:", !isNaN(projectId));
  const [messages, setMessages] = useState<Message[]>([
    {
      content: "Hi, feel free to ask a question here",
      isFromUser: false,
      timestamp: new Date(),
    },
  ]);
  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const sendMessageMutation = useMutation<ChatResponse, Error, { message: string; sessionId?: number }>({
    mutationFn: async ({ message, sessionId }) => {
      const res = await apiRequest("POST", `/api/projects/${projectId}/chat`, {
        message,
        sessionId,
      });
      return await res.json();
    },
    onSuccess: (data) => {
      // Update session ID if it's new
      if (!sessionId && data.sessionId) {
        onSessionCreated(data.sessionId);
      }

      // Add bot response to messages
      setMessages((prev) => [
        ...prev,
        {
          content: data.message.content,
          isFromUser: false,
          timestamp: new Date(),
        },
      ]);
    },
    onError: (error) => {
      toast({
        title: "Error sending the message",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = () => {
    if (inputValue.trim() === "") return;

    // Add user message to state immediately
    setMessages((prev) => [
      ...prev,
      {
        content: inputValue,
        isFromUser: true,
        timestamp: new Date(),
      },
    ]);

    // Send to API
    sendMessageMutation.mutate({
      message: inputValue,
      sessionId: sessionId || undefined,
    });

    // Clear input
    setInputValue("");
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <Card className="shadow rounded-lg overflow-hidden flex flex-col h-[500px]">
      <CardHeader className="px-4 py-3">
        <CardTitle className="text-lg font-medium">Test chatbota</CardTitle>
        <CardDescription>Try out how the chatbot answers questions</CardDescription>
      </CardHeader>
      <CardContent className="border-t p-0 flex-1 flex flex-col">
        <div className="flex-1 p-4 overflow-y-auto" id="chat-messages">
          {messages.map((message, index) => (
            <div
              key={index}
              className={`flex mb-4 ${message.isFromUser ? "justify-end" : ""}`}
            >
              {!message.isFromUser && (
                <div className="flex-shrink-0 mr-3">
                  <div className="h-8 w-8 rounded-full bg-primary-100 flex items-center justify-center">
                    <Bot className="h-5 w-5 text-primary-500" />
                  </div>
                </div>
              )}
              <div
                className={`${
                  message.isFromUser
                    ? "bg-primary-100 text-gray-800"
                    : "bg-gray-100 text-gray-800"
                } p-3 rounded-lg max-w-xs md:max-w-md lg:max-w-lg`}
              >
                <p className="text-sm">{message.content}</p>
              </div>
              {message.isFromUser && (
                <div className="flex-shrink-0 ml-3">
                  <div className="h-8 w-8 rounded-full bg-primary-500 flex items-center justify-center">
                    <span className="text-white text-sm font-bold">
                      JN
                    </span>
                  </div>
                </div>
              )}
            </div>
          ))}
          
          {/* Animated loading indicator while the answer is generated */}
          {sendMessageMutation.isPending && (
            <div className="mb-4">
              <AnimatedAITyping />
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>
        <div className="border-t p-4">
          <form 
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex"
          >
            <Input
              type="text"
              placeholder="Type a message..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={handleKeyPress}
              className="flex-1 focus:ring-primary-500 focus:border-primary-500"
              disabled={sendMessageMutation.isPending}
            />
            <Button
              type="submit"
              className="ml-3"
              disabled={inputValue.trim() === "" || sendMessageMutation.isPending}
            >
              {sendMessageMutation.isPending ? (
                <span className="flex items-center">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Sending...
                </span>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Odeslat
                </>
              )}
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}
