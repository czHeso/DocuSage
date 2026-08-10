import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import Sidebar from "@/components/sidebar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ShieldAlert, Trash2, KeyRound, UserCheck, UserPlus } from "lucide-react";
import { User } from "@shared/schema";

export default function AdminUsers() {
  const { user, isLoading: isUserLoading } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [selectedUsername, setSelectedUsername] = useState<string>("");
  const [newPassword, setNewPassword] = useState<string>("");
  
  // State for adding a new user
  const [isAddUserDialogOpen, setIsAddUserDialogOpen] = useState(false);
  const [newUserData, setNewUserData] = useState({
    username: "",
    email: "",
    password: "",
    role: "user"
  });

  useEffect(() => {
    // Redirect if the user is not an admin
    if (user && user.role !== "admin") {
      toast({
        title: "Access denied",
        description: "You need administrator rights to access this page.",
        variant: "destructive",
      });
      setLocation("/dashboard");
    }
  }, [user, setLocation, toast]);

  // Load all users (admins only)
  const { data: users, isLoading, error, refetch } = useQuery<User[]>({
    queryKey: ['/api/admin/users'],
    retry: 1,
    enabled: !!user && user.role === "admin", // Run the query only when an admin is logged in
  });

  // Mutation for creating a new user
  const createUserMutation = useMutation({
    mutationFn: async (userData: { username: string, email: string, password: string, role: string }) => {
      const response = await apiRequest("POST", "/api/admin/users", userData);
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: "User created",
        description: "The new user has been created.",
      });
      // Reset the form
      setNewUserData({
        username: "",
        email: "",
        password: "",
        role: "user"
      });
      setIsAddUserDialogOpen(false);
      // Refresh data
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
    },
    onError: (error: any) => {
      toast({
        title: "Error creating the user",
        description: error.message || "The new user could not be created.",
        variant: "destructive",
      });
    },
  });

  // Mutation for changing a user's role
  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: number, role: string }) => {
      const response = await apiRequest("PUT", `/api/admin/users/${userId}/role`, { role });
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: "Role updated",
        description: "The user's role has been changed.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
    },
    onError: (error: any) => {
      toast({
        title: "Error updating the role",
        description: error.message || "The user's role could not be updated.",
        variant: "destructive",
      });
    },
  });
  
  // Mutation for deleting a user
  const deleteUserMutation = useMutation({
    mutationFn: async (userId: number) => {
      const response = await apiRequest("DELETE", `/api/admin/users/${userId}`);
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: "User deleted",
        description: "The user has been deleted.",
      });
      // Reset dialog state
      setSelectedUserId(null);
      setSelectedUsername("");
      // Refresh data
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
    },
    onError: (error: any) => {
      toast({
        title: "Error deleting the user",
        description: error.message || "The user could not be deleted.",
        variant: "destructive",
      });
    },
  });
  
  // Mutation for changing a user's password
  const changePasswordMutation = useMutation({
    mutationFn: async ({ userId, newPassword }: { userId: number, newPassword: string }) => {
      const response = await apiRequest("PUT", `/api/admin/users/${userId}/password`, { newPassword });
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: "Password changed",
        description: "The user's password has been changed.",
      });
      // Reset dialog state
      setSelectedUserId(null);
      setSelectedUsername("");
      setNewPassword("");
    },
    onError: (error: any) => {
      toast({
        title: "Error changing the password",
        description: error.message || "The user's password could not be changed.",
        variant: "destructive",
      });
    },
  });
  
  // Mutation for activating a user
  const activateUserMutation = useMutation({
    mutationFn: async (userId: number) => {
      const response = await apiRequest("PUT", `/api/admin/users/${userId}/activate`);
      return await response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "User activated",
        description: "The user has been activated.",
      });
      // Refresh the user list
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
    },
    onError: (error: any) => {
      toast({
        title: "Error activating the user",
        description: error.message || "The user could not be activated.",
        variant: "destructive",
      });
    },
  });

  const handleRoleChange = (userId: number, role: string) => {
    updateRoleMutation.mutate({ userId, role });
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "admin":
        return <Badge className="bg-red-500">Admin</Badge>;
      case "unlimited":
        return <Badge className="bg-purple-500">Unlimited</Badge>;
      case "vip":
        return <Badge className="bg-blue-500">VIP</Badge>;
      default:
        return <Badge className="bg-gray-500">Standard</Badge>;
    }
  };

  if (isUserLoading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Deny access if the user is not an admin
  if (user && user.role !== "admin") {
    return null; // Will be redirected by useEffect
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
                <ShieldAlert className="mr-2 text-red-500" />
                <h1 className="text-2xl font-semibold text-gray-900">User management</h1>
              </div>
              <p className="mt-1 text-sm text-gray-500">
                Here you can manage user accounts and assign them roles.
              </p>
            </div>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 mt-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>User list</CardTitle>
                      <CardDescription>
                        Give users different levels of access according to their needs.
                      </CardDescription>
                    </div>
                    <Dialog open={isAddUserDialogOpen} onOpenChange={setIsAddUserDialogOpen}>
                      <DialogTrigger asChild>
                        <Button>
                          <UserPlus className="h-4 w-4 mr-2" />
                          Add user
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Add a new user</DialogTitle>
                          <DialogDescription>
                            Create a new user account with assigned permissions.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                          <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="username" className="text-right">
                              Username
                            </Label>
                            <Input
                              id="username"
                              value={newUserData.username}
                              onChange={(e) => setNewUserData(prev => ({ ...prev, username: e.target.value }))}
                              className="col-span-3"
                              placeholder="Enter a username"
                            />
                          </div>
                          <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="email" className="text-right">
                              Email
                            </Label>
                            <Input
                              id="email"
                              type="email"
                              value={newUserData.email}
                              onChange={(e) => setNewUserData(prev => ({ ...prev, email: e.target.value }))}
                              className="col-span-3"
                              placeholder="Zadejte emailovou adresu"
                            />
                          </div>
                          <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="password" className="text-right">
                              Heslo
                            </Label>
                            <Input
                              id="password"
                              type="password"
                              value={newUserData.password}
                              onChange={(e) => setNewUserData(prev => ({ ...prev, password: e.target.value }))}
                              className="col-span-3"
                              placeholder="Zadejte heslo"
                            />
                          </div>
                          <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="role" className="text-right">
                              Role
                            </Label>
                            <Select
                              value={newUserData.role}
                              onValueChange={(value) => setNewUserData(prev => ({ ...prev, role: value }))}
                            >
                              <SelectTrigger className="col-span-3">
                                <SelectValue placeholder="Vyberte roli" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="user">Standard</SelectItem>
                                <SelectItem value="vip">VIP</SelectItem>
                                <SelectItem value="unlimited">Unlimited</SelectItem>
                                <SelectItem value="admin">Admin</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <DialogFooter>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setIsAddUserDialogOpen(false)}
                          >
                            Cancel
                          </Button>
                          <Button
                            type="button"
                            onClick={() => createUserMutation.mutate(newUserData)}
                            disabled={createUserMutation.isPending || !newUserData.username || !newUserData.email || !newUserData.password}
                          >
                            {createUserMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : null}
                            Create user
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <div className="flex justify-center items-center py-20">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                  ) : error ? (
                    <div className="text-center py-10 text-red-500">
                      An error occurred while loading the users. Please try again.
                      <Button variant="outline" className="mt-4" onClick={() => refetch()}>
                        Zkusit znovu
                      </Button>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>ID</TableHead>
                          <TableHead>Username</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Role</TableHead>
                          <TableHead>Active</TableHead>
                          <TableHead>Registrace</TableHead>
                          <TableHead>Last login</TableHead>
                          <TableHead>Akce</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {users?.map((user) => (
                          <TableRow key={user.id}>
                            <TableCell>{user.id}</TableCell>
                            <TableCell>{user.username}</TableCell>
                            <TableCell>{user.email}</TableCell>
                            <TableCell>{getRoleBadge(user.role)}</TableCell>
                            <TableCell>
                              {user.isActive ? (
                                <Badge className="bg-green-500">Ano</Badge>
                              ) : (
                                <Badge variant="outline">Ne</Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              {new Date(user.createdAt).toLocaleDateString()}
                            </TableCell>
                            <TableCell>
                              {user.lastLogin
                                ? new Date(user.lastLogin).toLocaleDateString()
                                : "Nikdy"}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Select
                                  defaultValue={user.role}
                                  onValueChange={(value) => handleRoleChange(user.id, value)}
                                  disabled={
                                    updateRoleMutation.isPending ||
                                    (user.role === "admin" && user.id === 4) // Prevent modifying the first admin account
                                  }
                                >
                                  <SelectTrigger className="w-[110px]">
                                    <SelectValue placeholder="Vyberte roli" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="user">Standard</SelectItem>
                                    <SelectItem value="vip">VIP</SelectItem>
                                    <SelectItem value="unlimited">Unlimited</SelectItem>
                                    <SelectItem value="admin">Admin</SelectItem>
                                  </SelectContent>
                                </Select>
                                
                                {/* Password change dialog */}
                                <Dialog>
                                  <DialogTrigger asChild>
                                    <Button
                                      variant="outline"
                                      size="icon"
                                      onClick={() => {
                                        setSelectedUserId(user.id);
                                        setSelectedUsername(user.username);
                                        setNewPassword("");
                                      }}
                                      disabled={user.id === 4 && user.role === "admin"} // Prevent changing the main admin's password
                                    >
                                      <KeyRound className="h-4 w-4 text-blue-500" />
                                    </Button>
                                  </DialogTrigger>
                                  <DialogContent>
                                    <DialogHeader>
                                      <DialogTitle>Change the user's password</DialogTitle>
                                      <DialogDescription>
                                        Set a new password for {selectedUsername}.
                                      </DialogDescription>
                                    </DialogHeader>
                                    <div className="space-y-4 py-4">
                                      <div className="space-y-2">
                                        <Label htmlFor="newPassword">New password</Label>
                                        <Input
                                          id="newPassword"
                                          type="password"
                                          placeholder="Enter a new password"
                                          value={newPassword}
                                          onChange={(e) => setNewPassword(e.target.value)}
                                        />
                                        <p className="text-xs text-gray-500">
                                          The password must contain at least 8 characters.
                                        </p>
                                      </div>
                                    </div>
                                    <DialogFooter>
                                      <Button
                                        type="submit"
                                        onClick={() => {
                                          if (selectedUserId && newPassword) {
                                            changePasswordMutation.mutate({
                                              userId: selectedUserId,
                                              newPassword,
                                            });
                                          }
                                        }}
                                        disabled={!newPassword || newPassword.length < 8 || changePasswordMutation.isPending}
                                      >
                                        {changePasswordMutation.isPending ? (
                                          <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Processing...
                                          </>
                                        ) : (
                                          "Change password"
                                        )}
                                      </Button>
                                    </DialogFooter>
                                  </DialogContent>
                                </Dialog>
                                
                                {/* Button for activating a user (only shown when the user is inactive) */}
                                {!user.isActive && (
                                  <Button
                                    variant="outline"
                                    size="icon"
                                    onClick={() => activateUserMutation.mutate(user.id)}
                                    disabled={activateUserMutation.isPending}
                                    title="Activate user"
                                  >
                                    <UserCheck className="h-4 w-4 text-green-500" />
                                  </Button>
                                )}
                                
                                {/* AlertDialog for deleting a user */}
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button
                                      variant="outline"
                                      size="icon"
                                      onClick={() => {
                                        setSelectedUserId(user.id);
                                        setSelectedUsername(user.username);
                                      }}
                                      disabled={user.id === 4 && user.role === "admin"} // Prevent deleting the main admin
                                    >
                                      <Trash2 className="h-4 w-4 text-red-500" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Do you really want to delete this user?</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        The user <strong>{selectedUsername}</strong> will be permanently deleted. This cannot be undone.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction
                                        onClick={() => {
                                          if (selectedUserId) {
                                            deleteUserMutation.mutate(selectedUserId);
                                          }
                                        }}
                                        className="bg-red-500 hover:bg-red-600"
                                      >
                                        {deleteUserMutation.isPending ? (
                                          <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Deleting the user...
                                          </>
                                        ) : (
                                          "Delete user"
                                        )}
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}