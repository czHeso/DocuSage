import { useState, useEffect, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, MessageSquare } from "lucide-react";
import { Project } from "@shared/schema";

interface ChatMessage {
  content: string;
  isFromUser: boolean;
  timestamp?: Date;
}

// Map of color names to hex values
const colorMap: Record<string, string> = {
  blue: '#2563eb',
  green: '#10b981',
  red: '#ef4444',
  purple: '#8b5cf6',
  orange: '#f97316',
  teal: '#14b8a6',
  indigo: '#6366f1',
  yellow: '#eab308',
  pink: '#ec4899',
  gray: '#71717a'
};

// Definice keyframes animace pro bounce efekt
const bounceAnimation = `
@keyframes bounce {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-6px);
  }
}
`;

export default function EmbedChatbot() {
  const { projectId } = useParams<{ projectId: string }>();
  const [location] = useLocation();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [inputValue, setInputValue] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [themeStyle, setThemeStyle] = useState<"light" | "dark">("light");
  const [color, setColor] = useState<string>("blue");

  // Parse URL parameters for theme, color, chatbot name and welcome message
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const themeParam = searchParams.get("theme");
    const colorParam = searchParams.get("color");
    
    if (themeParam === "dark" || themeParam === "light") {
      setThemeStyle(themeParam);
    }

    if (colorParam) {
      setColor(colorParam);
    }
  }, [location]);

  // Convert color name to hex if needed
  const primaryColor = color.startsWith('#') ? color : (colorMap[color] || colorMap.blue);

  // Fetch project info to verify it exists and is active
  const { data: project, error } = useQuery<Project>({
    queryKey: [`/api/projects/${projectId}`],
    enabled: !!projectId && !isNaN(parseInt(projectId)),
  });

  // Fetch bot icon if project exists
  const { data: botIcon } = useQuery<Blob>({
    queryKey: [`/api/projects/${projectId}/bot-icon`],
    enabled: !!project?.id,
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });

  // Create bot icon URL if available
  const botIconUrl = botIcon ? URL.createObjectURL(botIcon) : null;

  // Use project color theme if no URL parameter
  useEffect(() => {
    if (project && project.colorTheme && !window.location.search.includes("color")) {
      setColor(project.colorTheme);
    }
  }, [project]);

  // Initial welcome message
  useEffect(() => {
    if (project && !messages.length) {
      // Using the project's custom welcome message
      const welcomeMessage = project.welcomeMessage || 'Hello, how can I help you?';
      setMessages([
        {
          content: welcomeMessage,
          isFromUser: false,
          timestamp: new Date(),
        },
      ]);
    }
  }, [project, messages.length]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    
    if (!inputValue.trim() || isLoading) return;
    
    const userMessage = inputValue.trim();
    setInputValue("");
    
    // Add user message to chat
    setMessages((prev) => [
      ...prev,
      { content: userMessage, isFromUser: true, timestamp: new Date() },
    ]);
    
    setIsLoading(true);
    
    try {
      // Send message to API
      // In embedded mode we must use an absolute path because the chatbot lives on another domain
      // than the server it talks to
      const baseUrl = window.location.origin;
      
      // This variable decides whether to use the embed API endpoint (true) or the standard project API (false)
      const useEmbedApi = false;
      
      let url, payload;
      
      if (useEmbedApi) {
        // Using the embed endpoint - authenticates with the token
        url = `${baseUrl}/api/chat-embed`;
        payload = {
          message: userMessage,
          sessionId,
          token: project?.embedToken
        };
        console.log('Using the embed API endpoint with token:', project?.embedToken);
      } else {
        // Using the standard in-app endpoint (works when logged in)
        url = `${baseUrl}/api/projects/${projectId}/chat`;
        payload = {
          message: userMessage,
          sessionId
        };
        console.log('Using the standard API endpoint for project:', projectId);
      }
      
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      
      if (!response.ok) {
        throw new Error("Failed to send message");
      }
      
      const data = await response.json();
      
      // Set session ID if not already set
      if (!sessionId && data.sessionId) {
        setSessionId(data.sessionId);
      }
      
      // Add AI response to chat
      setMessages((prev) => [
        ...prev,
        { 
          content: data.message.content, 
          isFromUser: false, 
          timestamp: new Date(data.message.timestamp || Date.now())
        },
      ]);
    } catch (error) {
      console.error("Error sending message:", error);
      // Add error message
      setMessages((prev) => [
        ...prev,
        { 
          content: "Sorry, an error occurred while communicating with the server. Please try again.", 
          isFromUser: false, 
          timestamp: new Date()
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-50 p-4">
        <div className="bg-white rounded-lg shadow-lg p-6 max-w-md w-full">
          <h2 className="text-xl font-bold text-red-500 mb-2">Chyba</h2>
          <p className="text-gray-700">
            This chatbot is unavailable or has been deactivated.
          </p>
        </div>
      </div>
    );
  }

  // Dynamic style based on theme
  const bgColor = themeStyle === "dark" ? "#1f2937" : "#f9fafb";
  const textColor = themeStyle === "dark" ? "#f9fafb" : "#111827";
  const secondaryBgColor = themeStyle === "dark" ? "#374151" : "#e5e7eb";
  const borderColor = themeStyle === "dark" ? "#4b5563" : "#d1d5db";
  
  return (
    <div 
      className="flex flex-col h-screen" 
      style={{ backgroundColor: bgColor, color: textColor }}
    >
      {/* Injecting the keyframes animation through a style tag */}
      <style dangerouslySetInnerHTML={{ __html: bounceAnimation }} />
      {/* Chat header */}
      <div 
        style={{ backgroundColor: primaryColor }} 
        className="text-white p-3 shadow-md flex items-center"
      >
        {botIconUrl ? (
          <img 
            src={botIconUrl} 
            alt="Bot Icon" 
            className="h-6 w-6 mr-2 rounded-full object-cover"
          />
        ) : (
          <MessageSquare className="h-5 w-5 mr-2" />
        )}
        <h1 className="text-lg font-medium">{project?.chatbotName || 'DocuSage Assistant'}</h1>
      </div>

      {/* Chat messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message, index) => (
          <div
            key={index}
            className={`flex items-start space-x-2 ${
              message.isFromUser ? "justify-end" : "justify-start"
            }`}
          >
            {!message.isFromUser && botIconUrl && (
              <img 
                src={botIconUrl} 
                alt="Bot Icon" 
                className="h-6 w-6 rounded-full object-cover flex-shrink-0 mt-1"
              />
            )}
            <div
              style={{ 
                backgroundColor: message.isFromUser ? primaryColor : secondaryBgColor,
                color: message.isFromUser ? "white" : textColor
              }}
              className={`max-w-[80%] rounded-lg p-3 ${
                message.isFromUser
                  ? "border-bottom-right-radius-4"
                  : "border-bottom-left-radius-4"
              }`}
            >
              <p className="whitespace-pre-wrap">{message.content}</p>
              {message.timestamp && (
                <p style={{ 
                    color: message.isFromUser 
                      ? "rgba(255, 255, 255, 0.7)" 
                      : (themeStyle === "dark" ? "#9ca3af" : "#6b7280")
                  }} 
                  className="text-xs mt-1"
                >
                  {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              )}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex items-start space-x-2 justify-start">
            {botIconUrl && (
              <img 
                src={botIconUrl} 
                alt="Bot Icon" 
                className="h-6 w-6 rounded-full object-cover flex-shrink-0 mt-1"
              />
            )}
            <div style={{ backgroundColor: secondaryBgColor, color: textColor }} className="rounded-lg p-3">
              <div className="flex flex-col space-y-2">
                <div className="flex items-center space-x-2">
                  <div className="h-2 w-2 rounded-full" 
                       style={{ backgroundColor: primaryColor, animation: "bounce 0.8s infinite" }}></div>
                  <div className="h-2 w-2 rounded-full" 
                       style={{ backgroundColor: primaryColor, animation: "bounce 0.8s 0.2s infinite" }}></div>
                  <div className="h-2 w-2 rounded-full" 
                       style={{ backgroundColor: primaryColor, animation: "bounce 0.8s 0.4s infinite" }}></div>
                </div>
                <p className="text-sm animate-pulse" style={{ color: textColor }}>
                  {["The AI is thinking...", "Processing the question...", "Looking for an answer..."][Math.floor(Date.now() / 1000) % 3]}
                </p>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Chat input */}
      <form 
        onSubmit={handleSubmit} 
        className="p-3 border-t"
        style={{ 
          backgroundColor: themeStyle === "dark" ? "#1f2937" : "white", 
          borderColor: borderColor
        }}
      >
        <div className="flex space-x-2">
          <Textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 resize-none"
            style={{ 
              backgroundColor: themeStyle === "dark" ? "#374151" : "#f9fafb",
              color: textColor,
              borderColor: borderColor
            }}
            rows={1}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
          />
          <Button 
            type="submit" 
            size="icon" 
            disabled={isLoading || !inputValue.trim()}
            style={{ backgroundColor: primaryColor }}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </form>
    </div>
  );
}