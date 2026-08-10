import { createContext, ReactNode, useContext } from "react";
import {
  useQuery,
  useMutation,
  UseMutationResult,
} from "@tanstack/react-query";
import { insertUserSchema, User as SelectUser, InsertUser, RegistrationResponse } from "@shared/schema";
import { getQueryFn, apiRequest, queryClient } from "../lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type AuthContextType = {
  user: SelectUser | null;
  isLoading: boolean;
  error: Error | null;
  loginMutation: UseMutationResult<SelectUser, Error, LoginData>;
  logoutMutation: UseMutationResult<void, Error, void>;
  registerMutation: UseMutationResult<RegistrationResponse, Error, InsertUser>;
};

type LoginData = Pick<InsertUser, "username" | "password">;

export const AuthContext = createContext<AuthContextType | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const {
    data: user,
    error,
    isLoading,
  } = useQuery<SelectUser | undefined, Error>({
    queryKey: ["/api/user"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const loginMutation = useMutation({
    mutationFn: async (credentials: LoginData) => {
      console.log("Attempting login with username:", credentials.username);
      try {
        const res = await apiRequest("POST", "/api/login", credentials);
        const userData = await res.json();
        console.log("Login successful, user data:", userData);
        return userData;
      } catch (err) {
        console.error("Login API error:", err);
        // Re-throw the error so the onError handler can process it
        throw err;
      }
    },
    onSuccess: (user: SelectUser) => {
      console.log("Setting user data in query cache");
      queryClient.setQueryData(["/api/user"], user);
      
      // Invalidate all queries that require auth
      queryClient.invalidateQueries({ queryKey: ['/api/user/projects'] });
    },
    onError: (error: any) => {
      console.error("Login error:", error);
      // We no longer need to handle the toast notification here, because
      // the login form component handles that directly, and it
      // also shows specific error messages for an unactivated account
      if (!(error.inactive)) {
        toast({
          title: "Login failed",
          description: error.message,
          variant: "destructive",
        });
      }
    },
  });

  const registerMutation = useMutation<RegistrationResponse, Error, InsertUser>({
    mutationFn: async (credentials: InsertUser) => {
      console.log("Attempting registration with username:", credentials.username);
      const res = await apiRequest("POST", "/api/register", credentials);
      const userData = await res.json();
      console.log("Registration successful, user data:", userData);
      return userData;
    },
    onSuccess: (data) => {
      // An account awaiting email activation is not logged in yet –
      // fetch the real state from the server instead of writing optimistically.
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      queryClient.invalidateQueries({ queryKey: ['/api/user/projects'] });
    },
    onError: (error: Error) => {
      console.error("Registration error:", error);
      toast({
        title: "Registrace selhala",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      console.log("Attempting logout");
      await apiRequest("POST", "/api/logout");
      console.log("Logout API call successful");
    },
    onSuccess: () => {
      console.log("Clearing user data from query cache");
      queryClient.setQueryData(["/api/user"], null);
      
      // Clear all cached data
      queryClient.invalidateQueries();
    },
    onError: (error: Error) => {
      console.error("Logout error:", error);
      toast({
        title: "Logout failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <AuthContext.Provider
      value={{
        user: user ?? null,
        isLoading,
        error,
        loginMutation,
        logoutMutation,
        registerMutation,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
