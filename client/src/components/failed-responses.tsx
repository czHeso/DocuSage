import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { cs } from "date-fns/locale";
import { useState } from "react";
import { 
  AlertTriangle, 
  CheckCircle2, 
  ExternalLink, 
  MessageSquare, 
  Trash2,
  FileText,
  Calendar
} from "lucide-react";

interface FailedResponse {
  id: number;
  userQuery: string;
  aiResponse: string;
  failureReason: string;
  chunksFound: number;
  documentsSearched: number;
  isResolved: boolean;
  adminNotes: string | null;
  resolvedAt: string | null;
  createdAt: string;
  sessionId: number | null;
}

interface FailedResponsesData {
  failedResponses: FailedResponse[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  summary: {
    total: number;
    unresolved: number;
    resolved: number;
  };
}

interface FailedResponsesProps {
  projectId: number;
}

const getFailureReasonText = (reason: string) => {
  switch (reason) {
    case 'no_relevant_chunks':
      return 'No relevant documents found';
    case 'insufficient_context':
      return 'Insufficient context';
    case 'technical_error':
      return 'Technical error';
    default:
      return reason;
  }
};

const getFailureReasonColor = (reason: string) => {
  switch (reason) {
    case 'no_relevant_chunks':
      return 'destructive';
    case 'insufficient_context':
      return 'secondary';
    case 'technical_error':
      return 'outline';
    default:
      return 'secondary';
  }
};

export default function FailedResponses({ projectId }: FailedResponsesProps) {
  const [selectedResponse, setSelectedResponse] = useState<FailedResponse | null>(null);
  const [adminNotes, setAdminNotes] = useState("");
  const [answerText, setAnswerText] = useState("");
  const [page, setPage] = useState(1);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery<FailedResponsesData>({
    queryKey: [`/api/projects/${projectId}/failed-responses`, page],
    enabled: !!projectId,
  });

  const resolveMutation = useMutation({
    mutationFn: async ({ responseId, notes }: { responseId: number; notes: string }) => {
      const response = await fetch(`/api/projects/${projectId}/failed-responses/${responseId}/resolve`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminNotes: notes })
      });
      if (!response.ok) throw new Error('Error marking it as resolved');
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "The answer has been marked as resolved",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/failed-responses`] });
      setSelectedResponse(null);
      setAdminNotes("");
    },
    onError: (error) => {
      toast({
        title: "Chyba",
        description: "The answer could not be marked as resolved",
        variant: "destructive",
      });
    },
  });

  /**
   * Writes the answer into the project's knowledge and resolves the entry.
   *
   * Separate from resolveMutation on purpose: resolving records that somebody
   * dealt with it, this changes what the chatbot knows. They happen together
   * here because answering a question is resolving it, and making somebody do
   * both would be busywork.
   */
  const answerMutation = useMutation({
    mutationFn: async ({ responseId, answer }: { responseId: number; answer: string }) => {
      const response = await fetch(`/api/projects/${projectId}/failed-responses/${responseId}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answer })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'The answer could not be saved');
      return data;
    },
    onSuccess: (data) => {
      toast({
        title: "Answer added",
        description: `The chatbot can now answer this. Your team has written ${data?.knowledge?.totalAnswers ?? 1} answer(s).`,
      });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/failed-responses`] });
      // The answers document gains a chunk, so the document list is stale too.
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/pdfs`] });
      setSelectedResponse(null);
      setAnswerText("");
    },
    onError: (error: Error) => {
      toast({
        title: "Chyba",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (responseId: number) => {
      const response = await fetch(`/api/projects/${projectId}/failed-responses/${responseId}`, {
        method: 'DELETE'
      });
      if (!response.ok) throw new Error('Error deleting');
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "The unsuccessful answer has been deleted",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/failed-responses`] });
    },
    onError: (error) => {
      toast({
        title: "Chyba",
        description: "The unsuccessful answer could not be deleted",
        variant: "destructive",
      });
    },
  });

  const handleResolve = (response: FailedResponse) => {
    setSelectedResponse(response);
    setAdminNotes(response.adminNotes || "");
    setAnswerText("");
  };

  const handleConfirmResolve = () => {
    if (selectedResponse) {
      // Whatever was typed as an answer is still worth keeping as a note, even
      // when somebody chooses not to teach it to the chatbot.
      resolveMutation.mutate({
        responseId: selectedResponse.id,
        notes: answerText.trim() || adminNotes
      });
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Cannot answer
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Cannot answer
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-gray-500 py-8">
            <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-gray-400" />
            <p>The data could not be loaded</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const summary = data?.summary || { total: 0, unresolved: 0, resolved: 0 };
  const failedResponses = data?.failedResponses || [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
          Cannot answer
          {summary.unresolved > 0 && (
            <Badge variant="destructive" className="ml-2">
              {summary.unresolved} unresolved
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Souhrn statistik */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <div className="text-2xl font-bold text-gray-900">{summary.total}</div>
            <div className="text-sm text-gray-500">Celkem</div>
          </div>
          <div className="text-center p-3 bg-red-50 rounded-lg">
            <div className="text-2xl font-bold text-red-600">{summary.unresolved}</div>
            <div className="text-sm text-red-500">Unresolved</div>
          </div>
          <div className="text-center p-3 bg-green-50 rounded-lg">
            <div className="text-2xl font-bold text-green-600">{summary.resolved}</div>
            <div className="text-sm text-green-500">Resolved</div>
          </div>
        </div>

        {failedResponses.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-green-400" />
            <p>No unsuccessful answers! 🎉</p>
            <p className="text-sm mt-2">Your chatbot is answering every question successfully.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {failedResponses.map((response) => (
              <div 
                key={response.id} 
                className={`border rounded-lg p-4 ${response.isResolved ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant={getFailureReasonColor(response.failureReason) as any}>
                        {getFailureReasonText(response.failureReason)}
                      </Badge>
                      {response.isResolved && (
                        <Badge variant="outline" className="text-green-600 border-green-300">
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          Resolved
                        </Badge>
                      )}
                      <span className="text-xs text-gray-500 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {formatDistanceToNow(new Date(response.createdAt), { addSuffix: true, locale: cs })}
                      </span>
                    </div>
                    
                    <div className="mb-2">
                      <p className="font-medium text-gray-900 mb-1">User's question:</p>
                      <p className="text-gray-700 text-sm bg-white p-2 rounded border">
                        {response.userQuery}
                      </p>
                    </div>
                    
                    <div className="mb-2">
                      <p className="font-medium text-gray-900 mb-1">AI answer:</p>
                      <p className="text-gray-700 text-sm bg-white p-2 rounded border">
                        {response.aiResponse}
                      </p>
                    </div>

                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <FileText className="w-3 h-3" />
                        {response.chunksFound} chunks found
                      </span>
                      <span className="flex items-center gap-1">
                        <MessageSquare className="w-3 h-3" />
                        {response.documentsSearched} documents searched
                      </span>
                      {response.sessionId && (
                        <span className="flex items-center gap-1">
                          <ExternalLink className="w-3 h-3" />
                          Session {response.sessionId}
                        </span>
                      )}
                    </div>

                    {response.adminNotes && (
                      <div className="mt-2">
                        <p className="font-medium text-gray-900 mb-1">Administrator notes:</p>
                        <p className="text-gray-600 text-sm bg-blue-50 p-2 rounded border">
                          {response.adminNotes}
                        </p>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2 ml-4">
                    {!response.isResolved && (
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleResolve(response)}
                          >
                            Answer
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Answer this question</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4">
                            <div>
                              <p className="text-sm text-gray-600 mb-2">
                                Dotaz: <strong>{selectedResponse?.userQuery}</strong>
                              </p>
                            </div>
                            <div>
                              <label className="text-sm font-medium">Answer</label>
                              <Textarea
                                value={answerText}
                                onChange={(e) => setAnswerText(e.target.value)}
                                placeholder="Write the answer the chatbot should have given..."
                                rows={4}
                                className="mt-1"
                              />
                              <p className="mt-1 text-xs text-muted-foreground">
                                Saved into the project as searchable knowledge, so the next
                                person asking this gets the answer from the chatbot. It
                                appears in your documents as "Answers written by your team".
                              </p>
                            </div>
                            <div className="flex flex-wrap justify-end gap-2">
                              <Button
                                variant="outline"
                                onClick={() => setSelectedResponse(null)}
                              >
                                Cancel
                              </Button>
                              <Button
                                variant="outline"
                                onClick={handleConfirmResolve}
                                disabled={resolveMutation.isPending || answerMutation.isPending}
                              >
                                {resolveMutation.isPending ? "Saving..." : "Only mark as resolved"}
                              </Button>
                              <Button
                                onClick={() =>
                                  selectedResponse &&
                                  answerMutation.mutate({
                                    responseId: selectedResponse.id,
                                    answer: answerText,
                                  })
                                }
                                disabled={!answerText.trim() || answerMutation.isPending}
                              >
                                {answerMutation.isPending ? "Saving..." : "Save answer"}
                              </Button>
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>
                    )}
                    
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteMutation.mutate(response.id)}
                      disabled={deleteMutation.isPending}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}