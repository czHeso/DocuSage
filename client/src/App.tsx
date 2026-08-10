import React from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider } from "./hooks/use-auth";
import { LanguageProvider } from "./hooks/use-language";
import { UpgradeProvider } from "./contexts/upgrade-context";
import { Loader2 } from "lucide-react";
import NotFound from "@/pages/not-found";
import AuthPage from "./pages/auth-page";
import ActivateAccount from "./pages/activate-account";
import Dashboard from "./pages/dashboard";
import ProjectDashboard from "./pages/project-dashboard";
import ProjectApi from "./pages/project-api";
import ChatHistory from "./pages/chat-history";
import ProjectStatistics from "./pages/project-statistics";
import TestPage from "./pages/test-page";
import TestProjectDetail from "./pages/test-project-detail";
import AdminUsers from "./pages/admin-users";
import UserSettings from "./pages/user-settings";
import { ProtectedRoute } from "./lib/protected-route";

function Router() {
  return (
    <Switch>
      {/* The home page redirects to the dashboard (auth protected) */}
      <ProtectedRoute path="/" component={Dashboard} />
      
      {/* Login and registration */}
      <Route path="/auth" component={AuthPage} />
      <Route path="/activate" component={ActivateAccount} />
      
      {/* Protected main routes */}
      <ProtectedRoute path="/dashboard" component={Dashboard} />
      <ProtectedRoute path="/projects/:id" component={ProjectDashboard} />
      <ProtectedRoute path="/projects/:id/api" component={ProjectApi} />
      <ProtectedRoute path="/projects/:id/chat-history" component={ChatHistory} />
      <ProtectedRoute path="/projects/:id/statistics" component={ProjectStatistics} />
      <Route path="/team">
        {() => {
          const TeamPage = React.lazy(() => import('./pages/team'));
          return (
            <React.Suspense fallback={<div className="flex items-center justify-center min-h-screen"><Loader2 className="h-8 w-8 animate-spin" /></div>}>
              <TeamPage />
            </React.Suspense>
          );
        }}
      </Route>
      <ProtectedRoute path="/settings" component={UserSettings} />
      <ProtectedRoute path="/admin/users" component={AdminUsers} />
      
      {/* Protected test routes */}
      <ProtectedRoute path="/test" component={TestPage} />
      <ProtectedRoute path="/test-project/:id" component={TestProjectDetail} />
      
      {/* Embed route for the chatbot - publicly accessible */}
      <Route path="/embed/:projectId">
        {() => {
          const EmbedChatbot = React.lazy(() => import('./pages/embed-chatbot'));
          return (
            <React.Suspense fallback={<div>Loading the chatbot...</div>}>
              <EmbedChatbot />
            </React.Suspense>
          );
        }}
      </Route>
      <Route path="/embed-preview.html">
        {() => {
          const EmbedPreview = React.lazy(() => import('./pages/embed-preview'));
          return (
            <React.Suspense fallback={<div>Loading the preview...</div>}>
              <EmbedPreview />
            </React.Suspense>
          );
        }}
      </Route>
      
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <LanguageProvider>
          <UpgradeProvider>
            <Router />
            <Toaster />
          </UpgradeProvider>
        </LanguageProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
