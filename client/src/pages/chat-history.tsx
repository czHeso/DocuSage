import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import Sidebar from "@/components/sidebar";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Table, 
  TableBody, 
  TableCaption, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Loader2, MessageSquare, User, Star } from "lucide-react";
import { Project, ChatSession, ChatMessage } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { cs } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function ChatHistory() {
  const params = useParams<{ id: string }>();
  const projectId = parseInt(params.id);
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedSession, setSelectedSession] = useState<number | null>(null);

  // Load the project details
  const { data: project, isLoading: isProjectLoading } = useQuery<Project>({
    queryKey: [`/api/projects/${projectId}`],
    enabled: !isNaN(projectId),
  });

  // Load the chat history for the project
  const { data: chatSessions, isLoading: isSessionsLoading } = useQuery<ChatSession[]>({
    queryKey: [`/api/projects/${projectId}/chat-sessions`],
    enabled: !isNaN(projectId),
  });

  // Load the messages for the selected chat session
  const { data: messages, isLoading: isMessagesLoading } = useQuery<ChatMessage[]>({
    queryKey: [`/api/projects/${projectId}/chat-sessions/${selectedSession}/messages`],
    enabled: !isNaN(projectId) && selectedSession !== null,
  });

  // On first page load, automatically select the first session (if any)
  useEffect(() => {
    if (chatSessions && chatSessions.length > 0 && !selectedSession) {
      setSelectedSession(chatSessions[0].id);
    }
  }, [chatSessions, selectedSession]);

  if (isProjectLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-xl font-bold">Projekt nenalezen</h2>
          <p className="text-gray-500">The project either does not exist or you do not have access to it.</p>
        </div>
      </div>
    );
  }

  // Formats a date in Czech format
  function formatDate(dateString: string) {
    const date = new Date(dateString);
    return format(date, "d. MMMM yyyy, HH:mm", { locale: cs });
  }

  // Renders the rating stars
  function renderStars(rating: number | null) {
    if (!rating) return null;
    
    return (
      <div className="flex items-center space-x-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`w-4 h-4 ${
              star <= rating 
                ? 'text-yellow-400 fill-yellow-400' 
                : 'text-gray-300'
            }`}
          />
        ))}
        <span className="text-sm text-gray-500 ml-1">({rating}/5)</span>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-white">
      <Sidebar activeProject={project} currentSection="chat-history" />
      
      <div className="flex-1 overflow-auto">
        <div className="py-8 px-4 sm:px-6 lg:px-8">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900">Chat history</h1>
            <p className="text-gray-500">
              All conversations held with the chatbot of project {project.name}
            </p>
          </div>

          {isSessionsLoading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : !chatSessions || chatSessions.length === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>No conversations</CardTitle>
                <CardDescription>
                  There have been no chatbot conversations in this project yet.
                </CardDescription>
              </CardHeader>
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="lg:col-span-1">
                <CardHeader>
                  <CardTitle>Conversation list</CardTitle>
                  <CardDescription>
                    {chatSessions.length} conversations in total
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {chatSessions.map((session) => (
                      <Card 
                        key={session.id}
                        className={`cursor-pointer transition-colors ${
                          selectedSession === session.id ? 'bg-primary-50 border-primary-200' : ''
                        }`}
                        onClick={() => setSelectedSession(session.id)}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center">
                              <MessageSquare className="h-5 w-5 text-primary mr-2" />
                              <span className="font-medium">Konverzace #{session.id}</span>
                            </div>
                            <Badge variant="outline">
                              {messages && selectedSession === session.id ? messages.length : 0} messages
                            </Badge>
                          </div>
                          <div className="mt-2 flex items-center justify-between">
                            <div className="text-sm text-gray-500">
                              {session.createdAt && formatDate(session.createdAt.toString())}
                            </div>
                            {session.rating && (
                              <div className="ml-2">
                                {renderStars(session.rating)}
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="lg:col-span-2">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>
                        {selectedSession ? `Konverzace #${selectedSession}` : 'Vyberte konverzaci'}
                      </CardTitle>
                      <CardDescription>
                        {selectedSession ? 'Conversation detail' : 'Click a conversation in the list on the left'}
                      </CardDescription>
                    </div>
                    {selectedSession && (
                      <div>
                        {(() => {
                          const currentSession = chatSessions?.find(s => s.id === selectedSession);
                          return currentSession?.rating ? renderStars(currentSession.rating) : null;
                        })()}
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {!selectedSession ? (
                    <div className="text-center py-12 text-gray-500">
                      <MessageSquare className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                      <p>Vyberte konverzaci ze seznamu</p>
                    </div>
                  ) : isMessagesLoading ? (
                    <div className="flex items-center justify-center h-64">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                  ) : !messages || messages.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                      <p>No messages found</p>
                    </div>
                  ) : (
                    <ScrollArea className="h-[600px] pr-4">
                      <div className="space-y-4">
                        {messages.map((message) => (
                          <div 
                            key={message.id}
                            className={`p-4 rounded-lg ${
                              message.isFromUser
                                ? 'bg-gray-100 ml-12'
                                : 'bg-primary-50 mr-12'
                            }`}
                          >
                            <div className="flex items-center mb-2">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                                message.isFromUser ? 'bg-blue-500' : 'bg-green-500'
                              } text-white mr-2`}>
                                {message.isFromUser ? 'U' : 'B'}
                              </div>
                              <div className="font-medium">
                                {message.isFromUser ? 'User' : 'Chatbot'}
                              </div>
                              <div className="ml-auto text-xs text-gray-500">
                                {message.createdAt && formatDate(message.createdAt.toString())}
                              </div>
                            </div>
                            <div className="pl-10 whitespace-pre-wrap">{message.content}</div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}