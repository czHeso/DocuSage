import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Users, Eye, Edit, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface ActiveUser {
  userId: number;
  username: string;
  email: string;
  activityType: 'viewing' | 'editing' | 'chatting';
  lastActivity: string;
  sessionId?: string;
}

interface CollaborationIndicatorProps {
  projectId: number;
  className?: string;
  showDetails?: boolean;
}

const getActivityIcon = (activityType: string) => {
  switch (activityType) {
    case 'editing':
      return <Edit className="h-3 w-3" />;
    case 'chatting':
      return <MessageCircle className="h-3 w-3" />;
    default:
      return <Eye className="h-3 w-3" />;
  }
};

const getActivityColor = (activityType: string) => {
  switch (activityType) {
    case 'editing':
      return 'bg-orange-500';
    case 'chatting':
      return 'bg-green-500';
    default:
      return 'bg-blue-500';
  }
};

const getActivityLabel = (activityType: string) => {
  switch (activityType) {
    case 'editing':
      return 'Upravuje';
    case 'chatting':
      return 'Chatting';
    default:
      return 'Viewing';
  }
};

export default function CollaborationIndicator({ 
  projectId, 
  className,
  showDetails = true 
}: CollaborationIndicatorProps) {
  const [isVisible, setIsVisible] = useState(false);

  // Fetch active users for the project
  const { data: activeUsers = [], refetch } = useQuery<ActiveUser[]>({
    queryKey: [`/api/projects/${projectId}/active-users`],
    enabled: !!projectId,
    refetchInterval: 5000, // Refresh every 5 seconds
    staleTime: 0,
  });

  // Show indicator only if there are active users (excluding current user potentially)
  useEffect(() => {
    setIsVisible(activeUsers.length > 0);
  }, [activeUsers]);

  if (!isVisible || activeUsers.length === 0) {
    return null;
  }

  const maxVisibleUsers = 3;
  const visibleUsers = activeUsers.slice(0, maxVisibleUsers);
  const hiddenCount = Math.max(0, activeUsers.length - maxVisibleUsers);

  return (
    <TooltipProvider>
      <div className={cn(
        "flex items-center space-x-2 p-2 bg-green-50 border border-green-200 rounded-lg",
        className
      )}>
        <div className="flex items-center">
          <Users className="h-4 w-4 text-green-600 mr-1" />
          <span className="text-sm font-medium text-green-700">
            Active: {activeUsers.length}
          </span>
        </div>

        {showDetails && (
          <>
            <div className="flex -space-x-2">
              {visibleUsers.map((user) => (
                <Tooltip key={`${user.userId}-${user.sessionId}`}>
                  <TooltipTrigger asChild>
                    <div className="relative">
                      <Avatar className="h-8 w-8 border-2 border-white">
                        <AvatarFallback className="text-xs">
                          {user.username.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className={cn(
                        "absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-white",
                        getActivityColor(user.activityType)
                      )}>
                        <div className="flex items-center justify-center h-full text-white">
                          {getActivityIcon(user.activityType)}
                        </div>
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <div className="text-center">
                      <p className="font-medium">{user.username}</p>
                      <p className="text-xs text-muted-foreground">
                        {getActivityLabel(user.activityType)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(user.lastActivity).toLocaleTimeString('cs-CZ', {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </p>
                    </div>
                  </TooltipContent>
                </Tooltip>
              ))}
              
              {hiddenCount > 0 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="secondary" className="h-8 w-8 rounded-full p-0 flex items-center justify-center">
                      +{hiddenCount}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p>And {hiddenCount} more user{hiddenCount > 1 ? 's' : ''}</p>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          </>
        )}
      </div>
    </TooltipProvider>
  );
}