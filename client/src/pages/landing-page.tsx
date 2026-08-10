import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import Navbar from "@/components/navbar";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/hooks/use-language";
import { Loader2 } from "lucide-react";
import { SEO } from "@/components/seo";
import { DocuSageChatbot } from "@/components/docusage-chatbot";

export default function LandingPage() {
  const { user, isLoading } = useAuth();
  const { language, t } = useLanguage();

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      <SEO 
        title={language === 'cs' ? 'DocuSage - AI chatbot for your documents' : 'DocuSage - AI chatbot for your documents'}
        description={language === 'cs' ? 'An intelligent AI chatbot that learns from your documents and talks to your clients. Increase your support efficiency.' : 'Intelligent AI chatbot that learns from your documents and communicates with your clients. Increase your support efficiency.'}
      />
      <DocuSageChatbot 
        token="xvrjxWItSKkdKPh1D65YP"
        color="blue"
        theme="light"
        chatbotName="DocuSage Assistant"
        welcomeMessage="Hi, how can I help you?"
        notificationEnabled={true}
        notificationDelay={5}
        notificationText="Need some advice?"
      />
      <Navbar />
      
      {/* Hero Section */}
      <div className="relative bg-white overflow-hidden">
        <div className="max-w-7xl mx-auto">
          <div className="relative z-10 pb-8 bg-white sm:pb-16 md:pb-20 lg:max-w-2xl lg:w-full lg:pb-28 xl:pb-32">
            <main className="mt-10 mx-auto max-w-7xl px-4 sm:mt-12 sm:px-6 md:mt-16 lg:mt-20 lg:px-8 xl:mt-28">
              <div className="sm:text-center lg:text-left">
                <h1 className="text-4xl tracking-tight font-extrabold text-gray-900 sm:text-5xl md:text-6xl">
                  <span className="block">{t('landing.hero.title1')}</span>
                  <span className="block text-primary">{t('landing.hero.title2')}</span>
                </h1>
                <p className="mt-3 text-base text-gray-500 sm:mt-5 sm:text-lg sm:max-w-xl sm:mx-auto md:mt-5 md:text-xl lg:mx-0">
                  {t('landing.hero.description')}
                </p>
                <div className="mt-5 sm:mt-8 sm:flex sm:justify-center lg:justify-start">
                  {isLoading ? (
                    <Button disabled size="lg">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t('nav.loading')}
                    </Button>
                  ) : user ? (
                    <Button asChild size="lg">
                      <Link href="/dashboard">{t('landing.hero.button.dashboard')}</Link>
                    </Button>
                  ) : (
                    <Button asChild size="lg">
                      <Link href="/auth">{t('landing.hero.button.try')}</Link>
                    </Button>
                  )}
                  <div className="mt-3 sm:mt-0 sm:ml-3">
                    <Button variant="outline" asChild size="lg">
                      <a href="#features">{t('landing.hero.button.more')}</a>
                    </Button>
                  </div>
                </div>
              </div>
            </main>
          </div>
        </div>
        <div className="lg:absolute lg:inset-y-0 lg:right-0 lg:w-1/2 flex items-center justify-center p-4 sm:p-6 md:p-8 lg:p-12">
          <div className="w-full max-w-md bg-white rounded-xl shadow-lg overflow-hidden" style={{ maxHeight: "450px", maxWidth: "300px" }}>
            <div className="bg-primary p-3 text-white flex justify-between items-center">
              <h3 className="font-medium text-base">DocuSage ChatBot</h3>
              <button className="p-1 rounded-full hover:bg-primary-dark focus:outline-none">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
            <div className="p-3 overflow-y-auto space-y-3" style={{ maxHeight: "300px" }}>
              {/* User message */}
              <div className="flex justify-end">
                <div className="bg-gray-100 p-2 rounded-lg max-w-[90%]">
                  <p className="text-xs">How do I upload a PDF document to the chatbot?</p>
                  <span className="text-[10px] text-gray-500 mt-0.5 block">11:42</span>
                </div>
              </div>
              
              {/* Bot answer */}
              <div className="flex justify-start">
                <div className="bg-primary/10 p-2 rounded-lg max-w-[90%]">
                  <p className="text-xs">To upload a PDF, go to project management, select a project, and click "Upload a new PDF". The chatbot learns from the document automatically.</p>
                  <span className="text-[10px] text-gray-500 mt-0.5 block">11:43</span>
                </div>
              </div>
              
              {/* User message */}
              <div className="flex justify-end">
                <div className="bg-gray-100 p-2 rounded-lg max-w-[90%]">
                  <p className="text-xs">How many PDF documents can I upload?</p>
                  <span className="text-[10px] text-gray-500 mt-0.5 block">11:44</span>
                </div>
              </div>
              
              {/* Bot answer */}
              <div className="flex justify-start">
                <div className="bg-primary/10 p-2 rounded-lg max-w-[90%]">
                  <p className="text-xs">The number depends on your plan. A standard account allows 3 PDF documents, VIP allows 20, and Unlimited allows up to 100.</p>
                  <span className="text-[10px] text-gray-500 mt-0.5 block">11:45</span>
                </div>
              </div>
            </div>
            
            {/* Input field */}
            <div className="border-t p-3">
              <div className="flex space-x-2">
                <input 
                  type="text" 
                  placeholder="Type a message..." 
                  className="flex-1 border rounded-full px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <button className="bg-primary text-white p-1.5 rounded-full hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-primary/50">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 0l-3 3a1 1 0 001.414 1.414L9 9.414V13a1 1 0 102 0V9.414l1.293 1.293a1 1 0 001.414-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1 text-center text-[10px]">Answers are generated by AI and may not always be accurate</p>
            </div>
          </div>
        </div>
      </div>

      {/* Why Choose Us Section */}
      <div className="py-12 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="lg:text-center">
            <h2 className="text-base text-primary font-semibold tracking-wide uppercase">{t('landing.why.title')}</h2>
            <p className="mt-2 text-3xl leading-8 font-extrabold tracking-tight text-gray-900 sm:text-4xl">
              {t('landing.why.subtitle')}
            </p>
            <p className="mt-4 max-w-2xl text-xl text-gray-500 lg:mx-auto">
              {t('landing.why.description')}
            </p>
          </div>

          <div className="mt-10">
            <dl className="space-y-10 md:space-y-0 md:grid md:grid-cols-3 md:gap-x-8 md:gap-y-10">
              <div className="relative">
                <dt>
                  <div className="absolute flex items-center justify-center h-12 w-12 rounded-md bg-primary text-white">
                    <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <p className="ml-16 text-lg leading-6 font-medium text-gray-900">{t('landing.feature.cards.deployment.title')}</p>
                </dt>
                <dd className="mt-2 ml-16 text-base text-gray-500">
                  {t('landing.feature.cards.deployment.description')}
                </dd>
              </div>

              <div className="relative">
                <dt>
                  <div className="absolute flex items-center justify-center h-12 w-12 rounded-md bg-primary text-white">
                    <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  </div>
                  <p className="ml-16 text-lg leading-6 font-medium text-gray-900">{t('landing.feature.cards.security.title')}</p>
                </dt>
                <dd className="mt-2 ml-16 text-base text-gray-500">
                  {t('landing.feature.cards.security.description')}
                </dd>
              </div>

              <div className="relative">
                <dt>
                  <div className="absolute flex items-center justify-center h-12 w-12 rounded-md bg-primary text-white">
                    <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
                    </svg>
                  </div>
                  <p className="ml-16 text-lg leading-6 font-medium text-gray-900">{t('landing.feature.cards.communication.title')}</p>
                </dt>
                <dd className="mt-2 ml-16 text-base text-gray-500">
                  {t('landing.feature.cards.communication.description')}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </div>

      {/* Pricing Section */}
      <div id="cenik" className="py-12 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="lg:text-center">
            <h2 className="text-base text-primary font-semibold tracking-wide uppercase">{t('landing.pricing.title')}</h2>
            <p className="mt-2 text-3xl leading-8 font-extrabold tracking-tight text-gray-900 sm:text-4xl">
              {t('landing.pricing.subtitle')}
            </p>
            <p className="mt-4 max-w-2xl text-xl text-gray-500 lg:mx-auto">
              {t('landing.pricing.description')}
            </p>
          </div>

          <div className="mt-10">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {/* Standard Plan */}
              <div className="border rounded-lg shadow-sm p-6 bg-white hover:shadow-md transition-shadow">
                <div className="text-center">
                  <h3 className="text-2xl font-bold text-gray-900">{t('landing.plans.standard.title')}</h3>
                  <p className="mt-4 text-5xl font-extrabold text-gray-900">{t('landing.plans.standard.price')}</p>
                  <p className="mt-2 text-sm text-gray-500">{t('landing.plans.standard.monthly')}</p>
                  <p className="mt-2 text-sm text-gray-500">{t('landing.plans.standard.description')}</p>
                </div>
                <ul className="mt-6 space-y-4">
                  <li className="flex items-start">
                    <span className="h-6 w-6 flex items-center justify-center text-green-500">✓</span>
                    <span className="ml-3 text-gray-700">{t('landing.plans.standard.feature1')}</span>
                  </li>
                  <li className="flex items-start">
                    <span className="h-6 w-6 flex items-center justify-center text-green-500">✓</span>
                    <span className="ml-3 text-gray-700">{t('landing.plans.standard.feature2')}</span>
                  </li>
                  <li className="flex items-start">
                    <span className="h-6 w-6 flex items-center justify-center text-green-500">✓</span>
                    <span className="ml-3 text-gray-700">{t('landing.plans.standard.feature3')}</span>
                  </li>
                  <li className="flex items-start">
                    <span className="h-6 w-6 flex items-center justify-center text-green-500">✓</span>
                    <span className="ml-3 text-gray-700">{t('landing.plans.standard.feature4')}</span>
                  </li>
                </ul>
                <div className="mt-8">
                  <Button className="w-full" asChild variant="outline">
                    <Link href="/auth">{t('landing.plans.standard.button')}</Link>
                  </Button>
                </div>
              </div>

              {/* VIP Plan */}
              <div className="border rounded-lg shadow-sm p-6 bg-white hover:shadow-md transition-shadow relative">
                <div className="absolute top-0 right-0 bg-primary text-white px-4 py-1 rounded-bl-lg rounded-tr-lg text-sm font-medium">
                  {t('landing.plans.vip.popular')}
                </div>
                <div className="text-center">
                  <h3 className="text-2xl font-bold text-gray-900">{t('landing.plans.vip.title')}</h3>
                  <p className="mt-4 text-5xl font-extrabold text-gray-900">{t('landing.plans.vip.price')}</p>
                  <p className="mt-2 text-sm text-gray-500">{t('landing.plans.vip.monthly')}</p>
                </div>
                <ul className="mt-6 space-y-4">
                  <li className="flex items-start">
                    <span className="h-6 w-6 flex items-center justify-center text-green-500">✓</span>
                    <span className="ml-3 text-gray-700">{t('landing.plans.vip.feature1')}</span>
                  </li>
                  <li className="flex items-start">
                    <span className="h-6 w-6 flex items-center justify-center text-green-500">✓</span>
                    <span className="ml-3 text-gray-700">{t('landing.plans.vip.feature2')}</span>
                  </li>
                  <li className="flex items-start">
                    <span className="h-6 w-6 flex items-center justify-center text-green-500">✓</span>
                    <span className="ml-3 text-gray-700">{t('landing.plans.vip.feature3')}</span>
                  </li>
                  <li className="flex items-start">
                    <span className="h-6 w-6 flex items-center justify-center text-green-500">✓</span>
                    <span className="ml-3 text-gray-700">{t('landing.plans.vip.feature4')}</span>
                  </li>
                  <li className="flex items-start">
                    <span className="h-6 w-6 flex items-center justify-center text-green-500">✓</span>
                    <span className="ml-3 text-gray-700">{t('landing.plans.vip.feature5')}</span>
                  </li>
                </ul>
                <div className="mt-8">
                  <Button className="w-full">
                    <Link href="/auth">{t('landing.plans.vip.button')}</Link>
                  </Button>
                  <p className="mt-2 text-xs text-center text-gray-500">
                    {t('landing.contact.details')} <a href="mailto:info@docusage.cz" className="text-primary hover:underline">info@docusage.cz</a>
                  </p>
                </div>
              </div>

              {/* Unlimited Plan */}
              <div className="border rounded-lg shadow-sm p-6 bg-white hover:shadow-md transition-shadow">
                <div className="text-center">
                  <h3 className="text-2xl font-bold text-gray-900">{t('landing.plans.unlimited.title')}</h3>
                  <p className="mt-4 text-5xl font-extrabold text-gray-900">{t('landing.plans.unlimited.price')}</p>
                  <p className="mt-2 text-sm text-gray-500">{t('landing.plans.unlimited.monthly')}</p>
                </div>
                <ul className="mt-6 space-y-4">
                  <li className="flex items-start">
                    <span className="h-6 w-6 flex items-center justify-center text-green-500">✓</span>
                    <span className="ml-3 text-gray-700">{t('landing.plans.unlimited.feature1')}</span>
                  </li>
                  <li className="flex items-start">
                    <span className="h-6 w-6 flex items-center justify-center text-green-500">✓</span>
                    <span className="ml-3 text-gray-700">{t('landing.plans.unlimited.feature2')}</span>
                  </li>
                  <li className="flex items-start">
                    <span className="h-6 w-6 flex items-center justify-center text-green-500">✓</span>
                    <span className="ml-3 text-gray-700">{t('landing.plans.unlimited.feature3')}</span>
                  </li>
                  <li className="flex items-start">
                    <span className="h-6 w-6 flex items-center justify-center text-green-500">✓</span>
                    <span className="ml-3 text-gray-700">{t('landing.plans.unlimited.feature4')}</span>
                  </li>
                  <li className="flex items-start">
                    <span className="h-6 w-6 flex items-center justify-center text-green-500">✓</span>
                    <span className="ml-3 text-gray-700">{t('landing.plans.unlimited.feature5')}</span>
                  </li>
                  <li className="flex items-start">
                    <span className="h-6 w-6 flex items-center justify-center text-green-500">✓</span>
                    <span className="ml-3 text-gray-700">{t('landing.plans.unlimited.feature6')}</span>
                  </li>
                </ul>
                <div className="mt-8">
                  <Button className="w-full" variant="outline">
                    <Link href="/auth">{t('landing.plans.unlimited.button')}</Link>
                  </Button>
                  <p className="mt-2 text-xs text-center text-gray-500">
                    {t('landing.contact.details')} <a href="mailto:info@docusage.cz" className="text-primary hover:underline">info@docusage.cz</a>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div id="features" className="py-12 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="lg:text-center">
            <h2 className="text-base text-primary font-semibold tracking-wide uppercase">{t('landing.features.title')}</h2>
            <p className="mt-2 text-3xl leading-8 font-extrabold tracking-tight text-gray-900 sm:text-4xl">
              {t('landing.features.subtitle')}
            </p>
            <p className="mt-4 max-w-2xl text-xl text-gray-500 lg:mx-auto">
              {t('landing.features.description')}
            </p>
          </div>

          <div className="mt-10">
            <dl className="space-y-10 md:space-y-0 md:grid md:grid-cols-2 md:gap-x-8 md:gap-y-10">
              <div className="relative">
                <dt>
                  <div className="absolute flex items-center justify-center h-12 w-12 rounded-md bg-primary text-white">
                    <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <p className="ml-16 text-lg leading-6 font-medium text-gray-900">{t('landing.features.detail.pdf.title')}</p>
                </dt>
                <dd className="mt-2 ml-16 text-base text-gray-500">
                  {t('landing.features.detail.pdf.description')}
                </dd>
              </div>

              <div className="relative">
                <dt>
                  <div className="absolute flex items-center justify-center h-12 w-12 rounded-md bg-primary text-white">
                    <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                    </svg>
                  </div>
                  <p className="ml-16 text-lg leading-6 font-medium text-gray-900">{t('landing.features.detail.embed.title')}</p>
                </dt>
                <dd className="mt-2 ml-16 text-base text-gray-500">
                  {t('landing.features.detail.embed.description')}
                </dd>
              </div>

              <div className="relative">
                <dt>
                  <div className="absolute flex items-center justify-center h-12 w-12 rounded-md bg-primary text-white">
                    <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                  </div>
                  <p className="ml-16 text-lg leading-6 font-medium text-gray-900">{t('landing.features.detail.team.title')}</p>
                </dt>
                <dd className="mt-2 ml-16 text-base text-gray-500">
                  {t('landing.features.detail.team.description')}
                </dd>
              </div>

              <div className="relative">
                <dt>
                  <div className="absolute flex items-center justify-center h-12 w-12 rounded-md bg-primary text-white">
                    <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                  <p className="ml-16 text-lg leading-6 font-medium text-gray-900">{t('landing.features.detail.analytics.title')}</p>
                </dt>
                <dd className="mt-2 ml-16 text-base text-gray-500">
                  {t('landing.features.detail.analytics.description')}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
      
      {/* Footer */}
      <footer className="bg-gray-800 text-white py-8">
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
              <div className="mt-4 space-y-2">
                <p className="text-sm text-gray-300">
                  <Link href="/privacy" className="hover:text-primary transition-colors">
                    {t('landing.footer.privacy')}
                  </Link>
                </p>
                <p className="text-sm text-gray-300">
                  <Link href="/document-processing" className="hover:text-primary transition-colors">
                    {t('landing.footer.docs')}
                  </Link>
                </p>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
