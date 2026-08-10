import { useState, useEffect } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { insertUserSchema, type RegistrationResponse } from "@shared/schema";
import { SEO } from "@/components/seo";
import { useLanguage } from "@/hooks/use-language";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, Loader2, CheckCircle, Mail } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Extend the schema for the login form
const loginSchema = z.object({
  username: z.string().min(1, { message: "The username is required" }),
  password: z.string().min(1, { message: "The password is required" }),
});

// Extend the schema for the register form
const registerSchema = insertUserSchema.extend({
  confirmPassword: z.string().min(1, { message: "Password confirmation is required" }),
  email: z.string()
    .min(1, { message: "Email is required" })
    .email({ message: "Invalid email format" }),
}).refine(data => data.password === data.confirmPassword, {
  message: "The passwords do not match",
  path: ["confirmPassword"],
});

type LoginFormValues = z.infer<typeof loginSchema>;
type RegisterFormValues = z.infer<typeof registerSchema>;

// Schema for the resend-activation-email form
const resendActivationSchema = z.object({
  email: z.string()
    .min(1, { message: "Email is required" })
    .email({ message: "Invalid email format" })
});

type ResendActivationFormValues = z.infer<typeof resendActivationSchema>;

/** Response of GET /api/auth/config */
interface AuthConfig {
  registrationEnabled: boolean;
  /** true = the instance is empty and the first registrant becomes an administrator */
  firstUserSetup: boolean;
  allowedEmailDomains: string[];
  minPasswordLength: number;
}

export default function AuthPage() {
  const [activeTab, setActiveTab] = useState<string>("login");
  const [, navigate] = useLocation();
  const { user, loginMutation, registerMutation } = useAuth();
  const { language } = useLanguage();
  const [showResendActivation, setShowResendActivation] = useState(false);
  const [isResendingActivation, setIsResendingActivation] = useState(false);
  const [resendActivationResult, setResendActivationResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  // Instance settings – control whether the registration form is shown
  const { data: authConfig } = useQuery<AuthConfig>({
    queryKey: ["/api/auth/config"],
  });

  // Setup login form
  const loginForm = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  // Setup register form
  const registerForm = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      username: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  // Setup resend activation form
  const resendActivationForm = useForm<ResendActivationFormValues>({
    resolver: zodResolver(resendActivationSchema),
    defaultValues: {
      email: "",
    },
  });

  // Handle login form submit
  const onLoginSubmit = (values: LoginFormValues) => {
    loginMutation.mutate(values);
  };

  const { toast } = useToast();
  
  // Handle register form submit
  const onRegisterSubmit = (values: RegisterFormValues) => {
    const { confirmPassword, ...userData } = values;
    
    registerMutation.mutate(userData, {
      onSuccess: (data: RegistrationResponse) => {
        // Clear the user data from the cache to avoid an automatic login
        queryClient.setQueryData(["/api/user"], null);
        
        // Check whether there were problems sending the email
        if (data.emailFailed) {
          toast({
            title: "Registration completed with a warning",
            description: data.message || "The account was created, but the activation email could not be sent. Please contact an administrator.",
            variant: "destructive",
            duration: 8000,
          });
        } else if (data.manualActivation) {
          toast({
            title: "The account was activated automatically",
            description: data.message || "The account was created and automatically activated in the development environment.",
            duration: 5000,
          });
          // Redirect to the dashboard after a short pause
          setTimeout(() => navigate("/dashboard"), 1500);
          return;
        } else {
          toast({
            title: "Registration successful",
            description: data.message || "An activation link has been sent to your email. You must activate the account before logging in.",
            duration: 8000,
          });
        }
        
        setActiveTab("login");
      }
    });
  };
  
  // Function for sending the activation email
  const onResendActivationSubmit = async (values: ResendActivationFormValues) => {
    try {
      setIsResendingActivation(true);
      const response = await fetch('/api/resend-activation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: values.email }),
      });
      
      const data = await response.json();
      setResendActivationResult(data);
      
      if (data.success) {
        toast({
          title: "Email sent",
          description: data.message,
          duration: 5000,
        });
        // Close the dialog after 3 seconds
        setTimeout(() => {
          setShowResendActivation(false);
          setResendActivationResult(null);
          resendActivationForm.reset();
        }, 3000);
      }
    } catch (error) {
      setResendActivationResult({
        success: false,
        message: "An error occurred while sending the email. Please try again."
      });
      toast({
        title: "Chyba",
        description: "An error occurred while sending the email",
        variant: "destructive",
      });
    } finally {
      setIsResendingActivation(false);
    }
  };
  
  // Redirect if already logged in
  useEffect(() => {
    if (user) {
      navigate("/dashboard");
    }
  }, [user, navigate]);

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <SEO 
        title={language === 'cs' ? 'Login and registration - DocuSage' : 'Login and Registration - DocuSage'}
        description={language === 'cs' ? 'Log in to your account or create a new one to access AI chatbots, document management, and other features of the DocuSage platform.' : 'Log in to your account or create a new one to access AI chatbots, document management, and other features of the DocuSage platform.'}
      />
      {/* Dialog for resending the activation email */}
      <Dialog open={showResendActivation} onOpenChange={setShowResendActivation}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <Mail className="mr-2 h-5 w-5 text-primary" />
              Send a new activation email
            </DialogTitle>
            <DialogDescription>
              Enter the email you registered with and we will send you a new activation link.
            </DialogDescription>
          </DialogHeader>
          
          {resendActivationResult ? (
            <div className="py-6 flex flex-col items-center justify-center">
              {resendActivationResult.success ? (
                <>
                  <CheckCircle className="h-12 w-12 text-green-500 mb-4" />
                  <p className="text-center">{resendActivationResult.message}</p>
                </>
              ) : (
                <>
                  <AlertCircle className="h-12 w-12 text-destructive mb-4" />
                  <p className="text-center">{resendActivationResult.message}</p>
                </>
              )}
            </div>
          ) : (
            <Form {...resendActivationForm}>
              <form onSubmit={resendActivationForm.handleSubmit(onResendActivationSubmit)} className="space-y-4">
                <FormField
                  control={resendActivationForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>E-mail</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="vas.email@email.cz" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button
                    type="submit"
                    disabled={isResendingActivation}
                    className="w-full"
                  >
                    {isResendingActivation ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      "Send activation email"
                    )}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          )}
        </DialogContent>
      </Dialog>
      
      {/* Left column - Form */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-8">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="flex justify-center">
              <svg className="h-12 w-12 text-primary" viewBox="0 0 40 40" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                <rect width="40" height="40" rx="8" fill="currentColor"/>
                <path d="M12 10H28M12 14H24M12 18H28M12 22H24" stroke="white" strokeWidth="3"/>
                <path d="M28 26C28 26 25 30 22 30C19 30 17 27 17 27" stroke="white" strokeWidth="3" strokeLinecap="round"/>
              </svg>
            </div>
            <h2 className="mt-2 text-3xl font-extrabold text-gray-900">DocuSage</h2>
            <p className="mt-2 text-sm text-gray-600">
              Sign in or create an account to work with AI chatbots
            </p>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Sign in</TabsTrigger>
              <TabsTrigger value="register">Registrace</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <Card>
                <CardHeader>
                  <CardTitle>Sign in</CardTitle>
                  <CardDescription>
                    Enter your login credentials
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {loginMutation.isError && (
                    <Alert variant="destructive" className="mb-4">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        {(loginMutation.error as { inactive?: boolean } | null)?.inactive
                          ? (
                            <div className="flex flex-col gap-2">
                              <span>The account is not activated. Check your email and click the activation link.</span>
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="mt-1 self-start"
                                onClick={() => setShowResendActivation(true)}
                              >
                                Send a new activation email
                              </Button>
                            </div>
                          )
                          : "Invalid login credentials"}
                      </AlertDescription>
                    </Alert>
                  )}

                  <Form {...loginForm}>
                    <form onSubmit={loginForm.handleSubmit(onLoginSubmit)} className="space-y-4">
                      <FormField
                        control={loginForm.control}
                        name="username"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Username</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={loginForm.control}
                        name="password"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Heslo</FormLabel>
                            <FormControl>
                              <Input type="password" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <Button 
                        type="submit" 
                        className="w-full" 
                        disabled={loginMutation.isPending}
                      >
                        {loginMutation.isPending ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Signing in...
                          </>
                        ) : (
                          "Sign in"
                        )}
                      </Button>
                    </form>
                  </Form>
                </CardContent>
                <CardFooter className="flex justify-center">
                  <Button 
                    variant="link" 
                    onClick={() => setActiveTab("register")}
                  >
                    No account? Registration information
                  </Button>
                </CardFooter>
              </Card>
            </TabsContent>

            <TabsContent value="register">
              {authConfig?.registrationEnabled ? (
                <Card>
                  <CardHeader>
                    <CardTitle>
                      {authConfig.firstUserSetup ? "Create the administrator account" : "Registrace"}
                    </CardTitle>
                    <CardDescription>
                      {authConfig.firstUserSetup
                        ? "This instance has no accounts yet. The first user to register becomes the administrator."
                        : "Create an account and start using DocuSage."}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {authConfig.allowedEmailDomains.length > 0 && (
                      <Alert className="mb-4">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>
                          Registration is only allowed for emails from these domains:{" "}
                          {authConfig.allowedEmailDomains.join(", ")}
                        </AlertDescription>
                      </Alert>
                    )}

                    <Form {...registerForm}>
                      <form onSubmit={registerForm.handleSubmit(onRegisterSubmit)} className="space-y-4">
                        <FormField
                          control={registerForm.control}
                          name="username"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Username</FormLabel>
                              <FormControl>
                                <Input autoComplete="username" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={registerForm.control}
                          name="email"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>E-mail</FormLabel>
                              <FormControl>
                                <Input type="email" autoComplete="email" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={registerForm.control}
                          name="password"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Heslo</FormLabel>
                              <FormControl>
                                <Input type="password" autoComplete="new-password" {...field} />
                              </FormControl>
                              <FormDescription>
                                At least {authConfig.minPasswordLength} characters.
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={registerForm.control}
                          name="confirmPassword"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Heslo znovu</FormLabel>
                              <FormControl>
                                <Input type="password" autoComplete="new-password" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <Button type="submit" className="w-full" disabled={registerMutation.isPending}>
                          {registerMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                          {authConfig.firstUserSetup ? "Create administrator account" : "Zaregistrovat se"}
                        </Button>
                      </form>
                    </Form>
                  </CardContent>
                  <CardFooter className="flex justify-center">
                    <Button variant="link" onClick={() => setActiveTab("login")}>
                      Already have an account? Sign in
                    </Button>
                  </CardFooter>
                </Card>
              ) : (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <AlertCircle className="mr-2 h-5 w-5 text-orange-500" />
                      Registration is not available
                    </CardTitle>
                    <CardDescription>
                      Public registration is disabled on this instance
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-center text-sm text-gray-600 space-y-2">
                      <p>An administrator of this instance can create an account for you.</p>
                      <p>Please get in touch with them.</p>
                    </div>
                  </CardContent>
                  <CardFooter className="flex justify-center">
                    <Button variant="link" onClick={() => setActiveTab("login")}>
                      Already have an account? Sign in
                    </Button>
                  </CardFooter>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Right column - Hero */}
      <div className="hidden lg:block relative w-0 flex-1">
        <img
          className="absolute inset-0 h-full w-full object-cover"
          src="https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?ixlib=rb-1.2.1&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=1374&q=80"
          alt="AI illustration"
        />
        <div className="absolute inset-0 bg-primary-600 bg-opacity-70"></div>
        <div className="absolute inset-0 flex items-center justify-center p-10">
          <div className="max-w-2xl text-white">
            <h1 className="text-4xl font-extrabold">
              Ultimate AI ChatBot Tool
            </h1>
            <p className="mt-4 text-xl">
              Build your own AI assistant that learns from your documents.
              Simple setup, complete analytics, and easy website embedding.
            </p>
            <ul className="mt-6 space-y-3">
              <li className="flex items-center">
                <svg className="h-6 w-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                </svg>
                <span>Learns from your own PDF files</span>
              </li>
              <li className="flex items-center">
                <svg className="h-6 w-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                </svg>
                <span>Team collaboration on projects</span>
              </li>
              <li className="flex items-center">
                <svg className="h-6 w-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                </svg>
                <span>Detailed statistics and analytics</span>
              </li>
              <li className="flex items-center">
                <svg className="h-6 w-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                </svg>
                <span>Easy integration into websites</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
