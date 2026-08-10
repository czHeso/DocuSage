import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { getInitials } from "@/lib/utils";
import { 
  HomeIcon, 
  PlusIcon,
  UsersIcon,
  SettingsIcon,
  LogOutIcon,
  Loader2,
  ShieldAlert,
  LayoutDashboard,
  Code,
  MessageSquare,
  Lock,
  BarChart3,
  LineChart
} from "lucide-react";
import { Project } from "@shared/schema";

interface SidebarProps {
  activeProject?: Project;
  currentSection?: "detail" | "api" | "chat-history" | "statistics"; // Parametr pro sekci projektu
}

export default function Sidebar({ activeProject, currentSection = "detail" }: SidebarProps) {
  const [location] = useLocation();
  const { user, logoutMutation } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Close mobile menu when location changes
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location]);

  const navItems = [
    {
      name: "Dashboard",
      href: "/dashboard",
      icon: HomeIcon,
      current: location === "/dashboard",
    },
    {
      name: "New project",
      href: "/dashboard?new",
      icon: PlusIcon,
      current: location === "/dashboard?new",
    },
    {
      name: "My team",
      href: "/team",
      icon: UsersIcon,
      current: location === "/team",
    },
    {
      name: "Settings",
      href: "/settings",
      icon: SettingsIcon,
      current: location === "/settings",
    },
  ];
  
  // Admin items - visible only to admin accounts
  const adminItems = user?.role === "admin" ? [
    {
      name: "User management",
      href: "/admin/users",
      icon: ShieldAlert,
      current: location === "/admin/users",
    }
  ] : [];
  
  // All menu items
  const allItems = [...navItems, ...adminItems];

  return (
    <>
      {/* Mobile menu button */}
      <div className="md:hidden fixed top-0 left-0 z-40 pl-1 pt-1 sm:pl-3 sm:pt-3">
        <button
          type="button"
          className="-ml-0.5 -mt-0.5 h-12 w-12 inline-flex items-center justify-center rounded-md text-gray-500 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500"
          onClick={() => setIsMobileMenuOpen(true)}
        >
          <span className="sr-only">Open sidebar</span>
          <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>

      {/* Mobile menu overlay */}
      {isMobileMenuOpen && (
        <div 
          className="md:hidden fixed inset-0 z-40 bg-gray-600 bg-opacity-75"
          onClick={() => setIsMobileMenuOpen(false)}
        ></div>
      )}

      {/* Mobile menu */}
      <div className={cn(
        "md:hidden fixed inset-y-0 left-0 z-50 w-full max-w-xs bg-gray-800 transform transition ease-in-out duration-300",
        isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="absolute top-0 right-0 -mr-12 pt-2">
          <button
            type="button"
            className="ml-1 flex items-center justify-center h-10 w-10 rounded-full focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white"
            onClick={() => setIsMobileMenuOpen(false)}
          >
            <span className="sr-only">Close sidebar</span>
            <svg className="h-6 w-6 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <SidebarContent navItems={allItems} user={user} activeProject={activeProject} currentSection={currentSection} onLogout={() => logoutMutation.mutate()} />
      </div>

      {/* Desktop sidebar */}
      <div className="hidden md:flex md:flex-shrink-0">
        <div className="flex flex-col w-64">
          <div className="flex flex-col h-0 flex-1 bg-gray-800">
            <SidebarContent navItems={allItems} user={user} activeProject={activeProject} currentSection={currentSection} onLogout={() => logoutMutation.mutate()} />
          </div>
        </div>
      </div>
    </>
  );
}

interface SidebarContentProps {
  navItems: {
    name: string;
    href: string;
    icon: React.ElementType;
    current: boolean;
  }[];
  user: any;
  activeProject?: Project;
  currentSection?: "detail" | "api" | "chat-history" | "statistics" | "team" | "topics";
  onLogout: () => void;
}

function SidebarContent({ navItems, user, activeProject, currentSection = "detail", onLogout }: SidebarContentProps) {
  return (
    <>
      <div className="flex-1 flex flex-col pt-5 pb-4 overflow-y-auto">
        <div className="flex items-center flex-shrink-0 px-4">
          <svg className="h-8 w-8 text-primary" viewBox="0 0 40 40" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
            <rect width="40" height="40" rx="8" fill="currentColor"/>
            <path d="M12 10H28M12 14H24M12 18H28M12 22H24" stroke="white" strokeWidth="3"/>
            <path d="M28 26C28 26 25 30 22 30C19 30 17 27 17 27" stroke="white" strokeWidth="3" strokeLinecap="round"/>
          </svg>
          <span className="ml-2 text-xl font-bold text-white">DocuSage</span>
        </div>
        <nav className="mt-5 flex-1 px-2 bg-gray-800 space-y-1">
          {/* Navigation Items */}
          {navItems.map((item) => (
            <Link 
              href={item.href} 
              key={item.name}
              className={cn(
                item.current
                  ? "bg-gray-900 text-white"
                  : "text-gray-300 hover:bg-gray-700 hover:text-white",
                "group flex items-center px-2 py-2 text-sm font-medium rounded-md"
              )}
            >
              <item.icon
                className={cn(
                  item.current ? "text-gray-300" : "text-gray-400 group-hover:text-gray-300",
                  "mr-3 h-6 w-6"
                )}
                aria-hidden="true"
              />
              {item.name}
            </Link>
          ))}

          {/* If we're in a project, show project navigation */}
          {activeProject && (
            <div className="py-4 space-y-3">
              <div className="text-xs text-gray-400 px-2 uppercase tracking-wider">
                Projekt: {activeProject.name}
              </div>
              
              <Link 
                href={`/projects/${activeProject.id}`}
                className={cn(
                  currentSection === "detail"
                    ? "bg-gray-900 text-white"
                    : "text-gray-300 hover:bg-gray-700 hover:text-white",
                  "group flex items-center px-2 py-2 text-sm font-medium rounded-md"
                )}
              >
                <LayoutDashboard
                  className={cn(
                    currentSection === "detail" ? "text-gray-300" : "text-gray-400 group-hover:text-gray-300",
                    "mr-3 h-6 w-6"
                  )}
                  aria-hidden="true"
                />
                Detail projektu
              </Link>
              
              <Link 
                href={`/projects/${activeProject.id}/chat-history`}
                className={cn(
                  currentSection === "chat-history"
                    ? "bg-gray-900 text-white"
                    : "text-gray-300 hover:bg-gray-700 hover:text-white",
                  "group flex items-center px-2 py-2 text-sm font-medium rounded-md"
                )}
              >
                <MessageSquare
                  className={cn(
                    currentSection === "chat-history" ? "text-gray-300" : "text-gray-400 group-hover:text-gray-300",
                    "mr-3 h-6 w-6"
                  )}
                  aria-hidden="true"
                />
                Chat history
              </Link>
              
              {/* Statistiky */}
              <Link 
                href={`/projects/${activeProject.id}/statistics`}
                className={cn(
                  currentSection === "statistics"
                    ? "bg-gray-900 text-white"
                    : "text-gray-300 hover:bg-gray-700 hover:text-white",
                  "group flex items-center px-2 py-2 text-sm font-medium rounded-md"
                )}
              >
                <BarChart3
                  className={cn(
                    currentSection === "statistics" ? "text-gray-300" : "text-gray-400 group-hover:text-gray-300",
                    "mr-3 h-6 w-6"
                  )}
                  aria-hidden="true"
                />
                Statistiky
              </Link>
              
              {/* API tab - shown with a lock icon for Standard accounts */}
              {user?.role === 'user' ? (
                <div 
                  className="text-gray-500 flex items-center px-2 py-2 text-sm font-medium rounded-md cursor-not-allowed"
                >
                  <Code className="text-gray-500 mr-3 h-6 w-6" aria-hidden="true" />
                  <span className="flex-1">API</span>
                  <span className="text-gray-500">
                    <Lock className="h-4 w-4" />
                  </span>
                </div>
              ) : (
                <Link 
                  href={`/projects/${activeProject.id}/api`}
                  className={cn(
                    currentSection === "api"
                      ? "bg-gray-900 text-white"
                      : "text-gray-300 hover:bg-gray-700 hover:text-white",
                    "group flex items-center px-2 py-2 text-sm font-medium rounded-md"
                  )}
                >
                  <Code
                    className={cn(
                      currentSection === "api" ? "text-gray-300" : "text-gray-400 group-hover:text-gray-300",
                      "mr-3 h-6 w-6"
                    )}
                    aria-hidden="true"
                  />
                  API
                </Link>
              )}
              
              <div className="pt-2">
                <Link 
                  href="/dashboard"
                  className="text-gray-300 hover:bg-gray-700 hover:text-white group flex items-center px-2 py-2 text-sm font-medium rounded-md"
                >
                  <svg className="text-gray-400 group-hover:text-gray-300 mr-3 h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 17l-5-5m0 0l5-5m-5 5h12" />
                  </svg>
                  Back to projects
                </Link>
              </div>
            </div>
          )}
        </nav>
      </div>
      <div className="flex-shrink-0 flex bg-gray-700 p-4">
        <div className="flex-shrink-0 w-full group block">
          <div className="flex items-center">
            <div>
              <Avatar>
                <AvatarFallback className="bg-primary-700 text-white">
                  {user ? getInitials(user.username) : "..."}
                </AvatarFallback>
              </Avatar>
            </div>
            <div className="ml-3 flex-1">
              <p className="text-base font-medium text-white">
                {user?.username || "..."}
              </p>
              <p className="text-sm font-medium text-gray-400 group-hover:text-gray-300">
                {user?.email || "..."}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="text-gray-400 hover:text-white"
              onClick={onLogout}
            >
              <LogOutIcon className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}