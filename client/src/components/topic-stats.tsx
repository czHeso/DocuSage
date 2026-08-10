import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, BarChart3 } from "lucide-react";
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';

// Typ pro topic ze serveru
interface Topic {
  id: number;
  projectId: number;
  name: string;
  count: number;
  lastQueried: Date;
  createdAt: Date;
}

// Type describing query details within a topic
interface TopicQuery {
  messageId: number;
  content: string;
  confidence: number;
  createdAt: Date;
}

export default function TopicStats({ projectId }: { projectId: number }) {
  const [selectedTopic, setSelectedTopic] = useState<Topic | null>(null);

  // Load the most frequent topics
  const { data: topics, isLoading } = useQuery<Topic[]>({
    queryKey: [`/api/projects/${projectId}/topics`],
    enabled: !isNaN(projectId),
  });

  // Load query details for the selected topic
  const { data: topicQueries, isLoading: isQueriesLoading } = useQuery<TopicQuery[]>({
    queryKey: [`/api/topics/${selectedTopic?.id}/queries`],
    enabled: !!selectedTopic,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Topic statistics</CardTitle>
          <CardDescription>Loading the most common topic statistics...</CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  if (!topics || topics.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Topic statistics</CardTitle>
          <CardDescription>There is not enough data yet for topic analysis</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Statistics appear once users start chatting with your chatbot.
            Every question is analysed automatically and assigned to a topic category.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <BarChart3 className="h-5 w-5 mr-2" />
          Most common topic statistics
        </CardTitle>
        <CardDescription>
          Overview of the topics users ask about most often
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Topic</TableHead>
              <TableHead className="text-right">Count</TableHead>
              <TableHead className="text-right">Last query</TableHead>
              <TableHead className="text-right">Akce</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {topics.map((topic) => (
              <TableRow key={topic.id}>
                <TableCell className="font-medium">
                  <Badge variant="secondary" className="mr-2">
                    {topic.name}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">{topic.count}</TableCell>
                <TableCell className="text-right">
                  {format(new Date(topic.lastQueried), 'dd.MM.yyyy HH:mm')}
                </TableCell>
                <TableCell className="text-right">
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => setSelectedTopic(topic)}
                      >
                        Zobrazit dotazy
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[700px]">
                      <DialogHeader>
                        <DialogTitle>
                          Queries on the topic: {selectedTopic?.name}
                        </DialogTitle>
                      </DialogHeader>
                      {isQueriesLoading ? (
                        <div className="flex justify-center p-4">
                          <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        </div>
                      ) : (
                        <ScrollArea className="h-[400px]">
                          {topicQueries && topicQueries.length > 0 ? (
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Dotaz</TableHead>
                                  <TableHead className="text-right w-[100px]">Relevance</TableHead>
                                  <TableHead className="text-right w-[150px]">Datum</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {topicQueries.map((query) => (
                                  <TableRow key={query.messageId}>
                                    <TableCell className="font-medium">
                                      {query.content}
                                    </TableCell>
                                    <TableCell className="text-right">
                                      {query.confidence.toFixed(0)}%
                                    </TableCell>
                                    <TableCell className="text-right">
                                      {format(new Date(query.createdAt), 'dd.MM.yyyy HH:mm')}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          ) : (
                            <p className="text-center p-4 text-muted-foreground">
                              There are no queries available for this topic.
                            </p>
                          )}
                        </ScrollArea>
                      )}
                    </DialogContent>
                  </Dialog>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}