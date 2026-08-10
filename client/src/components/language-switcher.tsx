import { Button } from "@/components/ui/button";
import { useLanguage } from "@/hooks/use-language";

export default function LanguageSwitcher() {
  const { language, setLanguage } = useLanguage();

  return (
    <div className="flex space-x-1 px-1 py-1 bg-gray-100 rounded-md">
      <Button
        variant={language === 'cs' ? "default" : "ghost"}
        size="sm"
        onClick={() => setLanguage('cs')}
        className={`${language === 'cs' ? 'text-white' : 'text-gray-600'} font-medium`}
      >
        CZ
      </Button>
      <Button
        variant={language === 'en' ? "default" : "ghost"}
        size="sm"
        onClick={() => setLanguage('en')}
        className={`${language === 'en' ? 'text-white' : 'text-gray-600'} font-medium`}
      >
        EN
      </Button>
    </div>
  );
}