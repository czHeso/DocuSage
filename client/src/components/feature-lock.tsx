import { Lock } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { useLanguage } from "@/hooks/use-language";
import { useUpgrade } from "@/contexts/upgrade-context";

interface FeatureLockProps {
  featureName: string;
  description: string;
  minPlanName: "VIP" | "Unlimited";
}

export default function FeatureLock({ featureName, description, minPlanName }: FeatureLockProps) {
  const { t } = useLanguage();
  const { openUpgradeDialog } = useUpgrade();
  
  const handleUpgradeClick = () => {
    // Opens the upgrade dialog
    openUpgradeDialog();
  };
  
  return (
    <Card className="border-dashed border-gray-300 bg-gray-50">
      <CardHeader className="flex flex-row items-center gap-4">
        <div className="bg-gray-200 rounded-full p-3">
          <Lock className="h-6 w-6 text-gray-500" />
        </div>
        <div>
          <CardTitle className="text-gray-500">{featureName}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center space-y-4 text-center p-4">
          <p className="text-sm text-gray-500">
            This feature is available only on the {minPlanName} plan and above.
          </p>
          <Button 
            className="w-full sm:w-auto"
            onClick={handleUpgradeClick}
          >
            Upgrade to {minPlanName}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}