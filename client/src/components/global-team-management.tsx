import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
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
import { Loader2, UserPlus, Trash2, RefreshCw } from "lucide-react";

// Form schema
const inviteFormSchema = z.object({
  email: z
    .string()
    .email({ message: "Invalid email" }),
});

type InviteFormValues = z.infer<typeof inviteFormSchema>;

interface TeamMemberUser {
  id: number;
  username: string;
  email: string;
}

export default function GlobalTeamManagement() {
  const [memberToRemove, setMemberToRemove] = useState<number | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch global team members
  const { data: teamMembers, isLoading, refetch } = useQuery<TeamMemberUser[]>({
    queryKey: ['/api/user/team'],
  });

  // Invite form
  const inviteForm = useForm<InviteFormValues>({
    resolver: zodResolver(inviteFormSchema),
    defaultValues: {
      email: "",
    },
  });

  // Invite mutation
  const inviteMutation = useMutation({
    mutationFn: async (values: InviteFormValues) => {
      const res = await apiRequest("POST", "/api/user/team", values);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/user/team'] });
      queryClient.invalidateQueries({ queryKey: ['/api/user/projects'] });
      inviteForm.reset({
        email: "",
      });
      toast({
        title: "User added",
        description: "The user has been added to the global team and to all of your projects.",
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
      await apiRequest("DELETE", `/api/user/team/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/user/team'] });
      queryClient.invalidateQueries({ queryKey: ['/api/user/projects'] });
      setMemberToRemove(null);
      toast({
        title: "User removed",
        description: "The user has been removed from the global team and from all of your projects.",
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

  // Submit invite form
  const onInviteSubmit = (values: InviteFormValues) => {
    inviteMutation.mutate(values);
  };

  return (
    <>
      <Card className="shadow overflow-hidden">
        <CardHeader>
          <CardTitle>Global team management</CardTitle>
          <CardDescription>
            Invite colleagues to all of your projects at once
          </CardDescription>
        </CardHeader>
        <CardContent className="border-t border-gray-200 p-6">
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
                    Add to team
                  </>
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => refetch()}
                className="mb-1 ml-2"
                disabled={isLoading}
              >
                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              </Button>
            </form>
          </Form>

          <div className="mt-6">
            <h4 className="text-sm font-medium text-gray-900">Global team members</h4>
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
                          {getInitials(member.username)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="ml-3">
                        <p className="text-sm font-medium text-gray-900">
                          {member.username}
                        </p>
                        <p className="text-sm text-gray-500">
                          {member.email}
                        </p>
                      </div>
                    </div>
                    <div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setMemberToRemove(member.id)}
                      >
                        <Trash2 className="h-4 w-4 text-gray-500 hover:text-red-500" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-center py-6 border border-dashed border-gray-300 rounded-md mt-2">
                <p className="text-sm text-gray-500">
                  There are no global team members yet
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
              Do you really want to remove this user from the global team? They will no longer have
              access to any of your projects.
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
    </>
  );
}