import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import StatsCard from "@/components/stats-card";
import { MessageSquare, Clock, Smartphone, Monitor, Laptop, RefreshCw, CheckCircle2 } from "lucide-react";
import { useState, useEffect } from "react";
import { formatDistanceToNow } from "date-fns";
import { cs } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";

interface AnalyticsStats {
  totalOpens: number;
  totalQueries: number;
  uniqueVisitors: number;
  topPages: { pageUrl: string; count: number }[];
  deviceStats: { deviceType: string; count: number }[];
  averageDuration: number;
}

interface AnalyticsMetadata {
  timestamp: number;
  requestId: string;
  processingTime: number;
  generated: string;
}

interface AnalyticsResponse {
  success: boolean;
  stats: AnalyticsStats;
  metadata: AnalyticsMetadata;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];
const DEVICE_ICONS: Record<string, React.ReactNode> = {
  'mobile': <Smartphone className="w-4 h-4 mr-2" />,
  'tablet': <Laptop className="w-4 h-4 mr-2" />,
  'desktop': <Monitor className="w-4 h-4 mr-2" />,
  'windows': <Monitor className="w-4 h-4 mr-2" />,
  'mac': <Laptop className="w-4 h-4 mr-2" />,
  'linux': <Monitor className="w-4 h-4 mr-2" />,
};

interface ChatbotAnalyticsProps {
  projectId: number;
  fullWidth?: boolean;
}

export default function ChatbotAnalytics({ projectId, fullWidth = false }: ChatbotAnalyticsProps) {
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [isManualRefetch, setIsManualRefetch] = useState<boolean>(false);
  const { toast } = useToast();

  // Adjusted for the new response structure with metadata and a timestamp
  const { 
    data: response, 
    isLoading, 
    isFetching,
    isError,
    error,
    refetch, 
    dataUpdatedAt 
  } = useQuery<AnalyticsResponse>({
    queryKey: [`/api/projects/${projectId}/chatbot-analytics/stats`],
    enabled: !isNaN(projectId),
    refetchInterval: 10000, // Refresh every 10 seconds
    refetchOnWindowFocus: true, // Refresh when returning to the window
    staleTime: 3000, // Treat the data as stale after 3 seconds
    retry: 3, // Retry the query up to 3 times on error
    refetchOnMount: true, // Always refetch the data when the component mounts
    
    // Watch metadata changes for better update detection
    select: (data) => {
      console.log('New analytics data received, timestamp:', data.metadata.timestamp);
      console.log('Data processed by the server in:', data.metadata.processingTime, 'ms');
      
      if (isManualRefetch) {
        toast({
          title: "Statistics updated",
          description: `Loaded ${data.stats.uniqueVisitors} visitors and ${data.stats.totalQueries} queries`,
          variant: "default",
        });
        setIsManualRefetch(false);
      }
      
      return data;
    }
  });
  
  // Update the last refresh time
  useEffect(() => {
    if (response?.metadata?.generated) {
      try {
        const date = new Date(response.metadata.generated);
        const formattedTime = formatDistanceToNow(date, { addSuffix: true, locale: cs });
        setLastUpdated(formattedTime);
      } catch (e) {
        setLastUpdated('');
      }
    }
  }, [response]);
  
  // Handler for manual refresh
  const handleRefresh = () => {
    setIsManualRefetch(true);
    refetch();
  };
  
  // Store stats in a variable
  const stats = response?.stats;

  if (isNaN(projectId)) {
    return <div>Invalid project ID</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-semibold">Statistiky chatbota</h2>
          <p className="text-muted-foreground text-sm pb-2">
            Overview of user interactions with the chatbot
            {lastUpdated && (
              <span className="text-xs ml-2 text-gray-500">
                Updated {lastUpdated}
              </span>
            )}
          </p>
        </div>
        <button 
          onClick={handleRefresh} 
          disabled={isFetching}
          className={`px-3 py-1 text-xs rounded transition-colors flex items-center ${
            isFetching 
              ? "bg-primary/5 text-primary/50 cursor-not-allowed" 
              : "bg-primary/10 hover:bg-primary/20 text-primary"
          }`}
        >
          {isFetching ? (
            <>
              <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
              Loading...
            </>
          ) : (
            <>
              <RefreshCw className="w-3 h-3 mr-1" />
              Aktualizovat
            </>
          )}
        </button>
      </div>

      {isError && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive mb-4">
          <p className="font-medium">The statistics could not be loaded</p>
          <p className="text-xs mt-1">{(error as any)?.message || "Please try again later"}</p>
        </div>
      )}

      <div className={fullWidth ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3" : "space-y-3"}>
        <StatsCard
          title="Chat opens"
          value={stats?.totalOpens || 0}
          icon="chat"
          isLoading={isLoading || isFetching}
        />
        <StatsCard
          title="Questions asked"
          value={stats?.totalQueries || 0}
          icon="chart"
          isLoading={isLoading || isFetching}
        />
        <StatsCard
          title="Unique visitors"
          value={stats?.uniqueVisitors || 0}
          icon="users"
          isLoading={isLoading || isFetching}
        />
        <StatsCard
          title="Average interaction time"
          value={stats?.averageDuration || 0}
          icon="clock"
          isLoading={isLoading || isFetching}
          suffix=" s"
        />
      </div>

      <div className={fullWidth ? "grid grid-cols-1 md:grid-cols-2 gap-4" : ""}>
        <Card className="border-0 shadow-sm">
          <CardHeader className="p-3">
            <CardTitle className="text-sm font-medium">Most visited pages</CardTitle>
            <CardDescription className="text-xs">
              Pages with the most interaction
            </CardDescription>
          </CardHeader>
          <CardContent className="p-3">
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-full" />
              </div>
            ) : stats?.topPages && stats.topPages.length > 0 ? (
              <div>
                <Table className="text-xs">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Page URL</TableHead>
                      <TableHead className="text-right">Count</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stats.topPages.slice(0, 5).map((page, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-medium truncate max-w-[150px]">
                          {page.pageUrl}
                        </TableCell>
                        <TableCell className="text-right">{page.count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                
                <div className={fullWidth ? "h-72 mt-4" : "h-60 mt-4"}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={stats.topPages.slice(0, 5)}
                      margin={{ top: 10, right: 10, left: 0, bottom: 40 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis 
                        dataKey="pageUrl"
                        angle={-45}
                        textAnchor="end"
                        height={60}
                        tick={{ fontSize: 10 }}
                      />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip 
                        formatter={(value: number) => [`${value} interactions`, 'Count']}
                        labelFormatter={(label) => `${label}`}
                        contentStyle={{ fontSize: '11px' }}
                      />
                      <Bar dataKey="count" fill="#8884d8" name="Count" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : (
              <div className="text-center py-4 text-muted-foreground text-xs">
                No data available yet
              </div>
            )}
          </CardContent>
        </Card>
        
        <Card className="border-0 shadow-sm mt-4 md:mt-0">
          <CardHeader className="p-3">
            <CardTitle className="text-sm font-medium">Breakdown by device</CardTitle>
            <CardDescription className="text-xs">
              Visitor device types
            </CardDescription>
          </CardHeader>
          <CardContent className="p-3">
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-full" />
              </div>
            ) : stats?.deviceStats && stats.deviceStats.length > 0 ? (
              <div className="space-y-4">
                <div>
                  <Table className="text-xs">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Device type</TableHead>
                        <TableHead className="text-right">Count</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stats.deviceStats.map((device, index) => (
                        <TableRow key={index}>
                          <TableCell className="py-2">
                            <div className="flex items-center">
                              {DEVICE_ICONS[device.deviceType.toLowerCase()] || <Monitor className="w-3 h-3 mr-1" />}
                              {device.deviceType}
                            </div>
                          </TableCell>
                          <TableCell className="text-right py-2">{device.count}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                
                <div className={fullWidth ? "h-64" : "h-48"}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={stats.deviceStats}
                        cx="50%"
                        cy="50%"
                        outerRadius={fullWidth ? 80 : 60}
                        fill="#8884d8"
                        dataKey="count"
                        nameKey="deviceType"
                        label={({ deviceType, percent }) => 
                          `${(percent * 100).toFixed(0)}%`
                        }
                      >
                        {stats.deviceStats.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: number) => [`${value}`, 'Count']}
                        contentStyle={{ fontSize: '11px' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : (
              <div className="text-center py-4 text-muted-foreground text-xs">
                No data available yet
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      
      {/* Footer with metadata */}
      {response?.metadata && (
        <div className="mt-8 pt-4 border-t border-border/30">
          <div className="flex justify-between items-center text-xs text-muted-foreground">
            <div className="flex items-center">
              <CheckCircle2 className="h-3 w-3 text-green-500 mr-1" />
              <span>
                Processed in {response.metadata.processingTime}ms
              </span>
            </div>
            <div className="text-right">
              <p>Request ID: {response.metadata.requestId}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}