import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import Sidebar from "@/components/sidebar";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Sun,
  Moon,
  Loader2,
  User as UserIcon,
  KeyRound,
  AlertTriangle,
} from "lucide-react";

export default function UserSettings() {
  const { user, isLoading, logoutMutation } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  
  // Mutation for updating settings (dark mode)
  const updateSettingsMutation = useMutation({
    mutationFn: async ({ darkMode }: { darkMode: boolean }) => {
      const response = await apiRequest("PUT", "/api/user/settings", { darkMode });
      return await response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Settings updated",
        description: "Your settings have been updated.",
      });
      queryClient.setQueryData(["/api/user"], data);
    },
    onError: (error: any) => {
      toast({
        title: "Error updating the settings",
        description: error.message || "The settings could not be updated.",
        variant: "destructive",
      });
    },
  });
  
  // Mutation for changing the password
  const changePasswordMutation = useMutation({
    mutationFn: async (passwordData: { currentPassword: string; newPassword: string }) => {
      const response = await apiRequest("POST", "/api/user/change-password", passwordData);
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: "Password changed",
        description: "Your password has been changed.",
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: (error: any) => {
      toast({
        title: "Error changing the password",
        description: error.message || "The password could not be changed.",
        variant: "destructive",
      });
    },
  });
  
  // Mutation for deleting the account
  const deleteAccountMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("DELETE", "/api/user/account");
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: "Account deleted",
        description: "Your account has been deleted.",
      });
      queryClient.setQueryData(["/api/user"], null);
      logoutMutation.mutate();
      setLocation("/");
    },
    onError: (error: any) => {
      toast({
        title: "Error deleting the account",
        description: error.message || "The account could not be deleted.",
        variant: "destructive",
      });
    },
  });
  
  const handleDarkModeToggle = (checked: boolean) => {
    updateSettingsMutation.mutate({ darkMode: checked });
    // Apply dark mode to the page
    document.documentElement.classList.toggle("dark", checked);
  };
  
  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validace hesel
    if (newPassword !== confirmPassword) {
      toast({
        title: "Error changing the password",
        description: "The new passwords do not match.",
        variant: "destructive",
      });
      return;
    }
    
    if (newPassword.length < 8) {
      toast({
        title: "Error changing the password",
        description: "The new password must be at least 8 characters long.",
        variant: "destructive",
      });
      return;
    }
    
    changePasswordMutation.mutate({ currentPassword, newPassword });
  };
  
  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  
  if (!user) {
    setLocation("/auth");
    return null;
  }

  return (
    <div className="h-screen flex overflow-hidden bg-gray-100">
      {/* Sidebar */}
      <Sidebar />

      {/* Main content */}
      <div className="flex flex-col w-0 flex-1 overflow-hidden">
        <main className="flex-1 relative z-0 overflow-y-auto focus:outline-none">
          <div className="py-6">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
              <div className="flex items-center">
                <UserIcon className="mr-2" />
                <h1 className="text-2xl font-semibold text-gray-900">Profile settings</h1>
              </div>
              <p className="mt-1 text-sm text-gray-500">
                Adjust your account settings and preferences.
              </p>
            </div>
            
            <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 mt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Basic information */}
                <Card>
                  <CardHeader>
                    <CardTitle>Account information</CardTitle>
                    <CardDescription>
                      An overview of your basic account information.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label htmlFor="username">Username</Label>
                      <Input id="username" value={user.username} disabled />
                    </div>
                    <div>
                      <Label htmlFor="email">E-mail</Label>
                      <Input id="email" value={user.email} disabled />
                    </div>
                    <div>
                      <Label htmlFor="role">Role</Label>
                      <Input id="role" value={
                        user.role === "user" ? "Standard" :
                        user.role === "vip" ? "VIP" :
                        user.role === "unlimited" ? "Unlimited" :
                        "Administrator"
                      } disabled />
                    </div>
                    <div>
                      <Label htmlFor="created">Account created</Label>
                      <Input
                        id="created"
                        value={new Date(user.createdAt).toLocaleDateString()}
                        disabled
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Appearance settings */}
                <Card>
                  <CardHeader>
                    <CardTitle>Appearance settings</CardTitle>
                    <CardDescription>
                      Adjust the appearance and behaviour of the application.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        {user.darkMode ? (
                          <Moon className="h-5 w-5 text-gray-600" />
                        ) : (
                          <Sun className="h-5 w-5 text-yellow-500" />
                        )}
                        <Label htmlFor="dark-mode" className="cursor-pointer">
                          Dark mode
                        </Label>
                      </div>
                      <Switch
                        id="dark-mode"
                        checked={user.darkMode}
                        onCheckedChange={handleDarkModeToggle}
                        disabled={updateSettingsMutation.isPending}
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Password change */}
                <Card>
                  <CardHeader>
                    <CardTitle>Change password</CardTitle>
                    <CardDescription>
                      Change your login password.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handleChangePassword} className="space-y-4">
                      <div>
                        <Label htmlFor="current-password">Current password</Label>
                        <Input
                          id="current-password"
                          type="password"
                          value={currentPassword}
                          onChange={(e) => setCurrentPassword(e.target.value)}
                          required
                        />
                      </div>
                      <div>
                        <Label htmlFor="new-password">New password</Label>
                        <Input
                          id="new-password"
                          type="password"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          required
                        />
                      </div>
                      <div>
                        <Label htmlFor="confirm-password">Confirm the new password</Label>
                        <Input
                          id="confirm-password"
                          type="password"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          required
                        />
                      </div>
                      <Button
                        type="submit"
                        className="w-full"
                        disabled={
                          changePasswordMutation.isPending ||
                          !currentPassword ||
                          !newPassword ||
                          !confirmPassword
                        }
                      >
                        {changePasswordMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                          <KeyRound className="h-4 w-4 mr-2" />
                        )}
                        Change password
                      </Button>
                    </form>
                  </CardContent>
                </Card>

                {/* Account deletion */}
                <Card className="border-red-100">
                  <CardHeader>
                    <CardTitle className="text-red-500 flex items-center">
                      <AlertTriangle className="h-5 w-5 mr-2" />
                      Account deletion
                    </CardTitle>
                    <CardDescription>
                      Permanently remove your account and all related data.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-gray-500 mb-4">
                      This action is irreversible and permanently deletes your account, all projects, and all uploaded documents.
                    </p>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button 
                          variant="destructive" 
                          className="w-full"
                          disabled={user.role === "admin"} // Administrator accounts cannot be deleted
                        >
                          Delete account
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Do you really want to delete your account?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This action cannot be undone. All of your data will be permanently deleted.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteAccountMutation.mutate()}
                            className="bg-red-500 hover:bg-red-600"
                          >
                            {deleteAccountMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : (
                              "Yes, delete my account"
                            )}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </CardContent>
                  {user.role === "admin" && (
                    <CardFooter className="px-6 pt-0">
                      <p className="text-xs text-red-500 italic">
                        Administrator accounts cannot be deleted this way.
                      </p>
                    </CardFooter>
                  )}
                </Card>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}