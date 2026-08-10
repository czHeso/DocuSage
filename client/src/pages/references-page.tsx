import { useLanguage } from "@/hooks/use-language";
import Navbar from "@/components/navbar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SEO } from "@/components/seo";

export default function ReferencesPage() {
  const { t, language } = useLanguage();

  // SAMPLE testimonial data.
  // DocuSage is an open-source project – these testimonials are fictional placeholders.
  // Replace them with your own only after obtaining those customers' consent.
  const references = [
    {
      name: language === 'cs' ? "Example Company Ltd." : "Example Company Ltd.",
      logo: "", // Optionally add a path to the logo, e.g. "/customer-logo.png"
      description: language === 'cs'
        ? "Description of the customer's industry and size."
        : "Description of the customer's industry and size.",
      testimonial: language === 'cs'
        ? "Add your customer's testimonial here – what they achieved with the chatbot, what improved, and how it changed their day-to-day work. This is placeholder text only."
        : "Add your customer's testimonial here – what they achieved with the chatbot, what improved, and how it changed their day-to-day work. This is placeholder text only.",
      website: "https://example.com"
    },
    {
      name: language === 'cs' ? "Second example reference" : "Second example reference",
      logo: "",
      description: language === 'cs'
        ? "Description of the customer's industry and size."
        : "Description of the customer's industry and size.",
      testimonial: language === 'cs'
        ? "Another placeholder testimonial. Only publish references with the customer's consent and their actual wording."
        : "Another placeholder testimonial. Only publish references with the customer's consent and their actual wording.",
      website: "https://example.com"
    }
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <SEO 
        title={language === 'cs' ? 'Reference - DocuSage' : 'References - DocuSage'}
        description={language === 'cs' ? 'See what our clients say about us and how DocuSage helps them improve customer communication.' : 'See what our clients are saying about us and how DocuSage helps them improve customer communication.'}
      />
      <Navbar />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-3xl font-bold text-center mb-8 text-gray-900">
          {language === 'cs' ? 'Reference' : 'References'}
        </h1>
        
        <p className="text-center text-gray-600 mb-10 max-w-3xl mx-auto">
          {language === 'cs' 
            ? 'See what our clients say about us and how DocuSage helps them improve customer communication and optimise their processes.' 
            : 'See what our clients are saying about us and how DocuSage helps them improve customer communication and optimize processes.'}
        </p>
        
        <div className="grid md:grid-cols-2 gap-8 mt-8">
          {references.map((reference, index) => (
            <Card key={index} className="overflow-hidden">
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-lg font-bold">{reference.name}</CardTitle>
                    <CardDescription className="text-sm">{reference.description}</CardDescription>
                  </div>
                  {/* A logo can be added when one is available */}
                  {/* <img src={reference.logo} alt={reference.name} className="h-12 w-auto" /> */}
                </div>
              </CardHeader>
              <CardContent>
                <blockquote className="italic text-gray-700 border-l-4 border-primary pl-4 py-2 mb-4">
                  "{reference.testimonial}"
                </blockquote>
                <div className="flex justify-end items-center">
                  <a 
                    href={reference.website} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="text-primary hover:underline"
                  >
                    {language === 'cs' ? 'Visit website' : 'Visit website'}
                  </a>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        
        <div className="mt-16 text-center">
          <h2 className="text-2xl font-bold mb-4 text-gray-900">
            {language === 'cs' ? 'Join our happy clients' : 'Join our satisfied clients'}
          </h2>
          <p className="text-gray-600 mb-6 max-w-2xl mx-auto">
            {language === 'cs' 
              ? 'Want to improve communication with your customers using an intelligent AI chatbot? Get in touch, or try DocuSage for free.' 
              : 'Want to improve communication with your customers using an intelligent AI chatbot? Contact us or try DocuSage for free.'}
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <a href="mailto:info@docusage.cz" className="px-6 py-2 bg-primary text-white rounded-md hover:bg-primary/90">
              {language === 'cs' ? 'Contact us' : 'Contact us'}
            </a>
            <a href="/" className="px-6 py-2 border border-primary text-primary rounded-md hover:bg-gray-100">
              {language === 'cs' ? 'Back to home' : 'Back to home'}
            </a>
          </div>
        </div>
      </div>
      
      {/* Footer */}
      <footer className="bg-gray-800 text-white py-8 mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between">
            <div>
              <div className="flex items-center">
                <svg className="h-8 w-8 text-primary" viewBox="0 0 40 40" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                  <rect width="40" height="40" rx="8" fill="currentColor"/>
                  <path d="M12 10H28M12 14H24M12 18H28M12 22H24" stroke="white" strokeWidth="3"/>
                  <path d="M28 26C28 26 25 30 22 30C19 30 17 27 17 27" stroke="white" strokeWidth="3" strokeLinecap="round"/>
                </svg>
                <span className="ml-2 text-xl font-bold">DocuSage</span>
              </div>
              <p className="mt-2 text-sm text-gray-400">
                {t('landing.footer.copyright').replace('{year}', new Date().getFullYear().toString())}
              </p>
            </div>
            <div className="mt-8 md:mt-0">
              <h3 className="text-sm font-semibold uppercase text-gray-400 tracking-wider">{t('landing.footer.contact')}</h3>
              <p className="mt-2 text-sm text-gray-300">
                {t('landing.footer.email')}
              </p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}