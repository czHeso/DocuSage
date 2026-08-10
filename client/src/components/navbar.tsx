import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/hooks/use-language";
import LanguageSwitcher from "./language-switcher";

export default function Navbar() {
  const { user, isLoading } = useAuth();
  const { t } = useLanguage();

  return (
    <nav className="bg-white shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex">
            <div className="flex-shrink-0 flex items-center">
              <Link href="/" className="flex items-center">
                <svg className="h-8 w-8 text-primary" viewBox="0 0 40 40" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                  <rect width="40" height="40" rx="8" fill="currentColor"/>
                  <path d="M12 10H28M12 14H24M12 18H28M12 22H24" stroke="white" strokeWidth="3"/>
                  <path d="M28 26C28 26 25 30 22 30C19 30 17 27 17 27" stroke="white" strokeWidth="3" strokeLinecap="round"/>
                </svg>
                <span className="ml-2 text-xl font-bold text-gray-900">DocuSage</span>
              </Link>
            </div>
          </div>
          <div className="flex items-center">
            <a href="#features" className="text-gray-500 hover:text-gray-700 px-3 py-2 rounded-md text-sm font-medium">{t('nav.features')}</a>
            <a href="#cenik" className="text-gray-500 hover:text-gray-700 px-3 py-2 rounded-md text-sm font-medium">{t('nav.pricing')}</a>
            <Link href="/references" className="text-gray-500 hover:text-gray-700 px-3 py-2 rounded-md text-sm font-medium">{t('nav.references')}</Link>
            <div className="ml-3">
              <LanguageSwitcher />
            </div>
            {isLoading ? (
              <Button disabled className="ml-4">{t('nav.loading')}</Button>
            ) : user ? (
              <Button asChild className="ml-4">
                <Link href="/dashboard">{t('nav.dashboard')}</Link>
              </Button>
            ) : (
              <Button asChild className="ml-4">
                <Link href="/auth">{t('nav.login')}</Link>
              </Button>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
