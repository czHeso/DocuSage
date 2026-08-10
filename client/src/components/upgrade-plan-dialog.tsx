import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "./ui/button";
import { useLanguage } from "@/hooks/use-language";
import { Mail } from "lucide-react";

interface UpgradePlanDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function UpgradePlanDialog({ isOpen, onClose }: UpgradePlanDialogProps) {
  const { language } = useLanguage();

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {language === "cs" ? "Upgrade na VIP tarif" : "Upgrade to VIP plan"}
          </DialogTitle>
          <DialogDescription>
            {language === "cs"
              ? "Get access to all advanced DocuSage features"
              : "Get access to all advanced DocuSage features"}
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <div className="space-y-4">
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="font-semibold text-lg mb-2">
                {language === "cs" ? "VIP tarif" : "VIP Plan"}
              </h3>
              <p className="text-sm mb-2">
                {language === "cs"
                  ? "999 CZK / month"
                  : "999 CZK per month"}
              </p>
              <ul className="text-sm space-y-1 mb-3">
                <li>• {language === "cs" ? "3 projekty" : "3 projects"}</li>
                <li>• {language === "cs" ? "20 PDF documents per project" : "20 PDF documents per project"}</li>
                <li>• {language === "cs" ? "Unlimited queries" : "Unlimited queries"}</li>
                <li>• {language === "cs" ? "Team management" : "Team management"}</li>
                <li>• {language === "cs" ? "API access" : "API access"}</li>
                <li>• {language === "cs" ? "Topic statistics" : "Topic statistics"}</li>
                <li>• {language === "cs" ? "Advanced training options" : "Advanced training options"}</li>
              </ul>
            </div>
            
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="font-semibold text-lg mb-2">
                {language === "cs" ? "Unlimited tarif" : "Unlimited Plan"}
              </h3>
              <p className="text-sm mb-2">
                {language === "cs"
                  ? "2,499 CZK / month"
                  : "2,499 CZK per month"}
              </p>
              <ul className="text-sm space-y-1 mb-3">
                <li>• {language === "cs" ? "99 projects" : "99 projects"}</li>
                <li>• {language === "cs" ? "100 PDF documents per project" : "100 PDF documents per project"}</li>
                <li>• {language === "cs" ? "Unlimited queries" : "Unlimited queries"}</li>
                <li>• {language === "cs" ? "Team management" : "Team management"}</li>
                <li>• {language === "cs" ? "API access" : "API access"}</li>
                <li>• {language === "cs" ? "Topic statistics" : "Topic statistics"}</li>
                <li>• {language === "cs" ? "Advanced training options" : "Advanced training options"}</li>
                <li>• {language === "cs" ? "Priority support" : "Priority support"}</li>
              </ul>
            </div>
            
            <div className="bg-primary/10 p-4 rounded-lg">
              <h3 className="font-semibold text-lg mb-2">
                {language === "cs" ? "Jak upgradovat" : "How to upgrade"}
              </h3>
              <p className="text-sm mb-4">
                {language === "cs"
                  ? "To upgrade to the VIP or Unlimited plan, contact us at:"
                  : "To upgrade to VIP or Unlimited plan, please contact us at:"}
              </p>
              <div className="flex items-center justify-center mb-4">
                <Mail className="mr-2 h-5 w-5 text-primary" />
                <a 
                  href="mailto:info@docusage.cz" 
                  className="text-primary font-medium hover:underline"
                >
                  info@docusage.cz
                </a>
              </div>
              <p className="text-xs text-gray-500 text-center">
                {language === "cs"
                  ? "We will get back to you within 24 hours with further instructions."
                  : "We will respond within 24 hours with further instructions."}
              </p>
            </div>
          </div>
        </div>
        <div className="flex justify-end">
          <Button 
            variant="outline" 
            onClick={onClose}
          >
            {language === "cs" ? "Close" : "Close"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}