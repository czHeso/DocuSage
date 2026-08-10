import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Project } from "@shared/schema";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  ChevronDown, 
  ChevronUp, 
  Users, 
  Loader2 
} from "lucide-react";
import TeamManagement from "@/components/team-management";
import FeatureLock from "@/components/feature-lock";

interface ProjectTeamCardProps {
  project: Project;
}

export default function ProjectTeamCard({ project }: ProjectTeamCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { user } = useAuth();

  // Determine whether the logged-in user owns the project
  const { data: isOwner, isLoading } = useQuery<boolean>({
    queryKey: [`/api/projects/${project.id}/isOwner`],
    enabled: !!project.id && isExpanded,
  });

  return (
    <Card className="shadow overflow-hidden">
      <CardHeader className="bg-gray-50 dark:bg-gray-800/50 cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <Users className="h-5 w-5 text-primary mr-2" />
            <div>
              <CardTitle className="text-lg">{project.name}</CardTitle>
              <CardDescription>
                Project team
              </CardDescription>
            </div>
          </div>
          <Button variant="ghost" size="icon">
            {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
          </Button>
        </div>
      </CardHeader>
      
      {isExpanded && (
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : user?.role === 'user' ? (
            <div className="p-4">
              <FeatureLock
                featureName="Project team management"
                description="Add and manage team members to collaborate on the project"
                minPlanName="VIP"
              />
            </div>
          ) : (
            <TeamManagement 
              projectId={project.id} 
              isOwner={isOwner ?? false} 
            />
          )}
        </CardContent>
      )}
    </Card>
  );
}