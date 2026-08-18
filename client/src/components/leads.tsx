import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { formatDistanceToNow } from "date-fns";
import { Mail, Trash2, MessageSquareWarning } from "lucide-react";
import type { Lead } from "@shared/schema";

interface LeadsProps {
  projectId: number;
}

const STATUS_LABELS: Record<Lead["status"], string> = {
  new: "New",
  contacted: "Contacted",
  closed: "Closed",
};

const STATUS_VARIANTS: Record<Lead["status"], "default" | "secondary" | "outline"> = {
  new: "default",
  contacted: "secondary",
  closed: "outline",
};

export default function Leads({ projectId }: LeadsProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: leads, isLoading } = useQuery<Lead[]>({
    queryKey: [`/api/projects/${projectId}/leads`],
    enabled: Number.isFinite(projectId) && projectId > 0,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/leads`] });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: Lead["status"] }) => {
      await apiRequest("PATCH", `/api/projects/${projectId}/leads/${id}`, { status });
    },
    onSuccess: invalidate,
    onError: (error: Error) => {
      toast({ title: "The lead could not be updated", description: error.message, variant: "destructive" });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/projects/${projectId}/leads/${id}`);
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Lead deleted" });
    },
    onError: (error: Error) => {
      toast({ title: "The lead could not be deleted", description: error.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <Card className="shadow">
        <CardHeader>
          <CardTitle>Contact requests</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  const newCount = leads?.filter((lead) => lead.status === "new").length ?? 0;

  return (
    <Card className="shadow">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          Contact requests
          {newCount > 0 && <Badge>{newCount} new</Badge>}
        </CardTitle>
        <CardDescription>
          People who asked something the chatbot could not answer and left their details.
          Replying to the notification email reaches them directly.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!leads || leads.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
            <MessageSquareWarning className="h-8 w-8" />
            <p>No contact requests yet.</p>
            <p className="max-w-md text-xs">
              The form is only offered when the chatbot cannot answer, and only if
              lead capture is switched on in the chatbot settings.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contact</TableHead>
                  <TableHead>Unanswered question</TableHead>
                  <TableHead>Received</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {leads.map((lead) => (
                  <TableRow key={lead.id}>
                    <TableCell className="align-top">
                      <a
                        href={`mailto:${lead.email}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {lead.email}
                      </a>
                      {lead.name && (
                        <div className="text-xs text-muted-foreground">{lead.name}</div>
                      )}
                      {lead.message && (
                        <div className="mt-1 max-w-xs whitespace-pre-wrap text-xs">{lead.message}</div>
                      )}
                      {!lead.notifiedAt && (
                        // Worth surfacing: without SMTP configured, nobody was
                        // told about this lead and this table is the only place
                        // it exists.
                        <div className="mt-1 text-xs text-amber-600">No notification email was sent</div>
                      )}
                    </TableCell>
                    <TableCell className="max-w-xs align-top text-sm">
                      {lead.unansweredQuestion ?? <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="align-top text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(lead.createdAt), { addSuffix: true })}
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="flex flex-col gap-1">
                        <Select
                          value={lead.status}
                          onValueChange={(status) =>
                            updateStatus.mutate({ id: lead.id, status: status as Lead["status"] })
                          }
                        >
                          <SelectTrigger className="h-8 w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(Object.keys(STATUS_LABELS) as Lead["status"][]).map((status) => (
                              <SelectItem key={status} value={status}>
                                {STATUS_LABELS[status]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Badge variant={STATUS_VARIANTS[lead.status]} className="w-fit">
                          {STATUS_LABELS[lead.status]}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="align-top">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => remove.mutate(lead.id)}
                        aria-label="Delete lead"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
