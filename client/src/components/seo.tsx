import React from 'react';
import { useLanguage } from '@/hooks/use-language';
import { Helmet } from 'react-helmet';

interface SEOProps {
  title?: string;
  description?: string;
  keywords?: string;
  ogImage?: string;
  canonicalUrl?: string;
}

export function SEO({ 
  title, 
  description, 
  keywords, 
  ogImage = 'https://docusage.cz/og-image.jpg',
  canonicalUrl
}: SEOProps) {
  const { language } = useLanguage();
  
  // Default values based on language
  const defaultTitle = language === 'cs' 
    ? 'DocuSage - Intelligent AI assistant for your documents' 
    : 'DocuSage - Intelligent AI Assistant for your documents';
  
  const defaultDescription = language === 'cs'
    ? 'DocuSage is an AI assistant that learns from your documents and answers any question your customers have. Increase your support efficiency with artificial intelligence.'
    : 'DocuSage is an AI assistant that learns from your documents and answers any questions from your customers. Increase your support efficiency with artificial intelligence.';
  
  const defaultKeywords = language === 'cs'
    ? 'AI assistant, artificial intelligence, documents, PDF, customer support, automation, chatbot, DocuSage'
    : 'AI assistant, artificial intelligence, documents, PDF, customer support, automation, chatbot, DocuSage';
  
  // Final values
  const finalTitle = title || defaultTitle;
  const finalDescription = description || defaultDescription;
  const finalKeywords = keywords || defaultKeywords;
  const siteUrl = 'https://docusage.cz';
  const currentUrl = canonicalUrl || window.location.href;
  
  return (
    <Helmet>
      <html lang={language} />
      <title>{finalTitle}</title>
      <meta name="description" content={finalDescription} />
      <meta name="keywords" content={finalKeywords} />
      
      {/* Open Graph / Facebook */}
      <meta property="og:type" content="website" />
      <meta property="og:url" content={currentUrl} />
      <meta property="og:title" content={finalTitle} />
      <meta property="og:description" content={finalDescription} />
      <meta property="og:image" content={ogImage} />
      <meta property="og:site_name" content="DocuSage" />
      
      {/* Twitter */}
      <meta property="twitter:card" content="summary_large_image" />
      <meta property="twitter:url" content={currentUrl} />
      <meta property="twitter:title" content={finalTitle} />
      <meta property="twitter:description" content={finalDescription} />
      <meta property="twitter:image" content={ogImage} />
      
      {/* Canonical URL */}
      <link rel="canonical" href={canonicalUrl || currentUrl} />
      
      {/* Structured Data for Organization */}
      <script type="application/ld+json">
        {JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          "name": "DocuSage",
          "url": siteUrl,
          "logo": `${siteUrl}/logo.png`,
          "description": finalDescription
        })}
      </script>
    </Helmet>
  );
}