import { useEffect, useRef } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, XAxis, YAxis, Tooltip, ResponsiveContainer, Bar } from "recharts";

interface ActivityData {
  date: string;
  count: number;
}

interface ActivityChartProps {
  data: ActivityData[];
  isLoading?: boolean;
}

export default function ActivityChart({ data, isLoading = false }: ActivityChartProps) {
  // Format date to day name
  const formatData = (data: ActivityData[]) => {
    return data.map(item => {
      const date = new Date(item.date);
      const dayName = new Intl.DateTimeFormat('cs-CZ', { weekday: 'short' }).format(date);
      return {
        ...item,
        dayName
      };
    });
  };

  const formattedData = formatData(data);

  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const date = new Date(label);
      const formattedDate = new Intl.DateTimeFormat('cs-CZ', { 
        day: 'numeric', 
        month: 'numeric',
        year: 'numeric' 
      }).format(date);
      
      return (
        <div className="bg-white p-2 border border-gray-200 shadow-md rounded-md">
          <p className="text-gray-600 text-xs">{formattedDate}</p>
          <p className="text-primary font-medium">
            {payload[0].value} {payload[0].value === 1 ? 'interakce' : 
             payload[0].value > 1 && payload[0].value < 5 ? 'interakce' : 'interactions'}
          </p>
        </div>
      );
    }
    
    return null;
  };

  return (
    <Card className="shadow overflow-hidden">
      <CardHeader className="px-4 py-5 sm:px-6">
        <CardTitle className="text-lg leading-6 font-medium">
          Activity over time
        </CardTitle>
        <CardDescription className="mt-1 max-w-2xl text-sm">
          Number of interactions over the last 7 days
        </CardDescription>
      </CardHeader>
      <CardContent className="border-t border-gray-200">
        {isLoading ? (
          <Skeleton className="w-full h-64" />
        ) : data.length === 0 ? (
          <div className="h-64 flex items-center justify-center">
            <p className="text-gray-500 text-sm">No data yet</p>
          </div>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={formattedData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                <XAxis 
                  dataKey="dayName" 
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#6B7280', fontSize: 12 }}
                />
                <YAxis 
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#6B7280', fontSize: 12 }}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar 
                  dataKey="count" 
                  fill="rgba(59, 130, 246, 0.8)"
                  radius={[4, 4, 0, 0]}
                  name="Interakce"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
