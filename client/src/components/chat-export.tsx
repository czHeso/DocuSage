import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ChatExportProps {
  sessionId: number | null;
  projectName?: string;
}

type ExportFormat = "json" | "csv" | "txt";

export default function ChatExport({ sessionId, projectName }: ChatExportProps) {
  const [format, setFormat] = useState<ExportFormat>("json");
  const [isExporting, setIsExporting] = useState(false);
  const { toast } = useToast();

  const handleExport = async () => {
    if (!sessionId) {
      toast({
        title: "Nothing to export",
        description: "Start a chat first to create some history",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsExporting(true);
      
      // Create a link to the export endpoint
      const exportUrl = `/api/chat-sessions/${sessionId}/export?format=${format}`;
      
      // Create and click a temporary link to download the file
      const link = document.createElement("a");
      link.href = exportUrl;
      link.setAttribute("download", `chat-export-${format}`);
      document.body.appendChild(link);
      link.click();
      
      // Remove the link from the DOM
      setTimeout(() => {
        document.body.removeChild(link);
      }, 100);
      
      toast({
        title: "Export started",
        description: `Export of the chat history in ${format.toUpperCase()} format has started.`,
      });
    } catch (error) {
      toast({
        title: "Export error",
        description: error instanceof Error ? error.message : "An unknown error occurred during the export",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Card className="shadow rounded-lg overflow-hidden">
      <CardHeader className="px-4 py-3">
        <CardTitle className="text-lg font-medium">Export chatu</CardTitle>
        <CardDescription>
          Export the chat history for later use or analysis
        </CardDescription>
      </CardHeader>
      <CardContent className="p-4">
        <div className="flex flex-col space-y-4">
          <div>
            <Select
              value={format}
              onValueChange={(value) => setFormat(value as ExportFormat)}
              disabled={isExporting || !sessionId}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose an export format" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="json">JSON (structured data)</SelectItem>
                <SelectItem value="csv">CSV (tabular format)</SelectItem>
                <SelectItem value="txt">TXT (plain text)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-500">
              {sessionId 
                ? `Export historie chatu ${projectName ? `projektu ${projectName}` : ''}`
                : "No chat history has been created yet"}
            </div>
            <Button 
              onClick={handleExport}
              disabled={isExporting || !sessionId}
              variant="default"
            >
              {isExporting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Exportuji...
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  Exportovat
                </>
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}