import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { validateEmail } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { getInitials } from "@/lib/utils";
import { Loader2, UserPlus, Trash2 } from "lucide-react";

// Form schema
const inviteFormSchema = z.object({
  email: z
    .string()
    .email({ message: "Invalid email" }),
  role: z.enum(["editor", "viewer"], {
    required_error: "Vyberte roli",
  }),
});

type InviteFormValues = z.infer<typeof inviteFormSchema>;

// Role update schema
const roleUpdateSchema = z.object({
  role: z.enum(["editor", "viewer"], {
    required_error: "Vyberte roli",
  }),
});

type RoleUpdateValues = z.infer<typeof roleUpdateSchema>;

interface TeamManagementProps {
  projectId: number;
  isOwner: boolean;
}

interface TeamMemberWithUser {
  id: number;
  projectId: number;
  userId: number;
  role: 'owner' | 'editor' | 'viewer';
  createdAt: string;
  user: {
    id: number;
    username: string;
    email: string;
  };
}

export default function TeamManagement({
  projectId,
  isOwner,
}: TeamManagementProps) {
  const [memberToRemove, setMemberToRemove] = useState<number | null>(null);
  const [memberToEdit, setMemberToEdit] = useState<TeamMemberWithUser | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch team members
  const { data: teamMembers, isLoading } = useQuery<TeamMemberWithUser[]>({
    queryKey: [`/api/projects/${projectId}/team`],
    enabled: !!projectId,
  });

  // Invite form
  const inviteForm = useForm<InviteFormValues>({
    resolver: zodResolver(inviteFormSchema),
    defaultValues: {
      email: "",
      role: "editor",
    },
  });

  // Role update form
  const roleUpdateForm = useForm<RoleUpdateValues>({
    resolver: zodResolver(roleUpdateSchema),
    defaultValues: {
      role: "editor",
    },
  });

  // Invite mutation
  const inviteMutation = useMutation({
    mutationFn: async (values: InviteFormValues) => {
      const res = await apiRequest("POST", `/api/projects/${projectId}/team`, values);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/team`] });
      inviteForm.reset({
        email: "",
        role: "editor",
      });
      toast({
        title: "User added",
        description: "The user has been added to the team.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error adding the user",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  // Remove member mutation
  const removeMemberMutation = useMutation({
    mutationFn: async (userId: number) => {
      await apiRequest("DELETE", `/api/projects/${projectId}/team/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/team`] });
      setMemberToRemove(null);
      toast({
        title: "User removed",
        description: "The user has been removed from the team.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error removing the user",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  // Update role mutation
  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: number; role: string }) => {
      const res = await apiRequest("PATCH", `/api/projects/${projectId}/team/${userId}`, { role });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/team`] });
      setMemberToEdit(null);
      toast({
        title: "Role updated",
        description: "The user's role has been updated.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error updating the role",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  // Submit invite form
  const onInviteSubmit = (values: InviteFormValues) => {
    inviteMutation.mutate(values);
  };

  // Submit role update form
  const onRoleUpdateSubmit = (values: RoleUpdateValues) => {
    if (memberToEdit) {
      updateRoleMutation.mutate({
        userId: memberToEdit.userId,
        role: values.role,
      });
    }
  };

  return (
    <>
      <Card className="shadow overflow-hidden">
        <CardHeader>
          <CardTitle>Team management</CardTitle>
          <CardDescription>
            Invite colleagues to collaborate on the project
          </CardDescription>
        </CardHeader>
        <CardContent className="border-t border-gray-200 p-6">
          {isOwner && (
            <Form {...inviteForm}>
              <form
                onSubmit={inviteForm.handleSubmit(onInviteSubmit)}
                className="flex mb-4 items-end"
              >
                <div className="max-w-xs w-full mr-2">
                  <FormField
                    control={inviteForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email address</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="kolega@example.com"
                            {...field}
                            autoComplete="off"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="w-32 mr-2">
                  <FormField
                    control={inviteForm.control}
                    name="role"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Role</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Role" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="editor">Editor</SelectItem>
                            <SelectItem value="viewer">Viewer</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <Button
                  type="submit"
                  className="mb-1"
                  disabled={inviteMutation.isPending}
                >
                  {inviteMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <UserPlus className="h-4 w-4 mr-2" />
                      Pozvat
                    </>
                  )}
                </Button>
              </form>
            </Form>
          )}

          <div className="mt-6">
            <h4 className="text-sm font-medium text-gray-900">Team members</h4>
            {isLoading ? (
              <div className="flex justify-center items-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            ) : teamMembers && teamMembers.length > 0 ? (
              <ul className="mt-3 divide-y divide-gray-200">
                {teamMembers.map((member) => (
                  <li
                    key={member.id}
                    className="py-4 flex items-center justify-between"
                  >
                    <div className="flex items-center">
                      <Avatar>
                        <AvatarFallback>
                          {member.user ? getInitials(member.user.username) : 'XX'}
                        </AvatarFallback>
                      </Avatar>
                      <div className="ml-3">
                        <p className="text-sm font-medium text-gray-900">
                          {member.user ? member.user.username : 'User unavailable'}
                          {member.role === "owner" ? " (Vy)" : ""}
                        </p>
                        <p className="text-sm text-gray-500">
                          {member.user ? member.user.email : 'Email unavailable'}
                        </p>
                      </div>
                    </div>
                    <div>
                      <span
                        className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full mr-2 ${
                          member.role === "owner"
                            ? "bg-green-100 text-green-800"
                            : member.role === "editor"
                            ? "bg-blue-100 text-blue-800"
                            : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {member.role === "owner"
                          ? "Owner"
                          : member.role === "editor"
                          ? "Editor"
                          : "Viewer"}
                      </span>
                      {isOwner && member.role !== "owner" && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setMemberToEdit(member);
                              roleUpdateForm.setValue("role", member.role as "editor" | "viewer");
                            }}
                          >
                            Upravit
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setMemberToRemove(member.userId)}
                          >
                            <Trash2 className="h-4 w-4 text-gray-500 hover:text-red-500" />
                          </Button>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-center py-6 border border-dashed border-gray-300 rounded-md mt-2">
                <p className="text-sm text-gray-500">
                  There are no team members yet
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Remove Member Dialog */}
      <AlertDialog
        open={memberToRemove !== null}
        onOpenChange={() => setMemberToRemove(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove team member?</AlertDialogTitle>
            <AlertDialogDescription>
              Do you really want to remove this user from the team? They will no longer have
              access to the project.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (memberToRemove !== null) {
                  removeMemberMutation.mutate(memberToRemove);
                }
              }}
              className="bg-red-600 hover:bg-red-700"
            >
              {removeMemberMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Odebrat"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Role Dialog */}
      {memberToEdit && (
        <AlertDialog
          open={memberToEdit !== null}
          onOpenChange={(open) => !open && setMemberToEdit(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Change role</AlertDialogTitle>
              <AlertDialogDescription>
                Change the role of {memberToEdit.user.username}.
              </AlertDialogDescription>
            </AlertDialogHeader>

            <Form {...roleUpdateForm}>
              <form onSubmit={roleUpdateForm.handleSubmit(onRoleUpdateSubmit)}>
                <FormField
                  control={roleUpdateForm.control}
                  name="role"
                  render={({ field }) => (
                    <FormItem className="mb-4">
                      <FormLabel>Role</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Vyberte roli" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="editor">Editor</SelectItem>
                          <SelectItem value="viewer">Viewer</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    type="submit"
                    className="bg-primary"
                    disabled={updateRoleMutation.isPending}
                  >
                    {updateRoleMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Save"
                    )}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </form>
            </Form>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}
