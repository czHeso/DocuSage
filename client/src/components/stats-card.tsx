import {
  Card,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageSquare, Users, FileText, BarChart, Clock } from "lucide-react";

interface StatsCardProps {
  title: string;
  value: number;
  icon: "chat" | "users" | "pdf" | "chart" | "clock";
  linkText?: string;
  linkHref?: string;
  isLoading?: boolean;
  suffix?: string;
}

export default function StatsCard({
  title,
  value,
  icon,
  linkText,
  linkHref,
  isLoading = false,
  suffix = "",
}: StatsCardProps) {
  // Determine which icon to use
  const IconComponent = icon === "chat"
    ? MessageSquare
    : icon === "users"
    ? Users
    : icon === "pdf"
    ? FileText
    : icon === "clock"
    ? Clock
    : BarChart;

  return (
    <Card className="bg-white overflow-hidden shadow rounded-lg">
      <CardContent className="p-5">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <IconComponent className="h-6 w-6 text-gray-400" />
          </div>
          <div className="ml-5 w-0 flex-1">
            <dl>
              <dt className="text-sm font-medium text-gray-500 truncate">
                {title}
              </dt>
              <dd>
                {isLoading ? (
                  <Skeleton className="h-8 w-16 mt-1" />
                ) : (
                  <div className="text-lg font-medium text-gray-900">
                    {value.toLocaleString()}{suffix}
                  </div>
                )}
              </dd>
            </dl>
          </div>
        </div>
      </CardContent>
      {linkText && linkHref && (
        <CardFooter className="bg-gray-50 px-5 py-3">
          <div className="text-sm">
            <a
              href={linkHref}
              className="font-medium text-primary-700 hover:text-primary-900"
            >
              {linkText}
            </a>
          </div>
        </CardFooter>
      )}
    </Card>
  );
}
