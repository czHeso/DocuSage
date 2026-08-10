import { useLanguage } from "@/hooks/use-language";
import Navbar from "@/components/navbar";
import { Link } from "wouter";
import { SEO } from "@/components/seo";

export default function DocumentProcessingPage() {
  const { language } = useLanguage();

  return (
    <div className="min-h-screen bg-gray-50">
      <SEO 
        title={language === 'cs' ? 'Document processing - DocuSage' : 'Document Processing - DocuSage'}
        description={language === 'cs' ? 'How DocuSage processes and analyses PDF documents to build an AI chatbot. Security, data protection, and document ownership.' : 'Information about how DocuSage processes and analyzes PDF documents to create an AI chatbot. Security, data protection, and document ownership.'}
      />
      <Navbar />
      
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-3xl font-bold text-center mb-8 text-gray-900">
          {language === 'cs' ? 'Document processing' : 'Document Processing'}
        </h1>
        
        <div className="bg-white p-6 rounded-lg shadow-sm prose prose-slate max-w-none">
          {language === 'cs' ? (
            <>
              <h2>How DocuSage processes your documents</h2>
              <p>
                DocuSage je inteligentní chatovací robot (chatbot), který se učí z vašich PDF dokumentů a 
                pomáhá odpovídat na dotazy týkající se jejich obsahu. Pro správné fungování naší služby 
                potřebujeme zpracovat a analyzovat obsah vašich nahraných dokumentů.
              </p>
              
              <h3>The document processing pipeline</h3>
              <p>
                Když nahrajete PDF dokument do DocuSage, provádíme následující kroky:
              </p>
              <ol>
                <li>
                  <strong>Extrakce textu</strong> - Nejprve extrahujeme veškerý text z nahraného PDF souboru. 
                  Pro standardní dokumenty používáme běžnou PDF extrakci textu. Pro naskenované dokumenty nebo 
                  obrázky používáme pokročilé OCR (Optical Character Recognition) technologie.
                </li>
                <li>
                  <strong>Analysis and indexing</strong> - Text je analyzován a indexován pro efektivní vyhledávání. 
                  Rozpoznáváme klíčová témata, entity a vztahy v textu.
                </li>
                <li>
                  <strong>Embedding generation</strong> - Vytváříme vektorové reprezentace (embeddings) obsahu, 
                  které umožňují AI modelu přesně pochopit sémantický význam textu.
                </li>
                <li>
                  <strong>Connecting to the AI model</strong> - Zpracovaný a indexovaný obsah je propojen s naším 
                  AI jazykovým modelem, který je schopen odpovídat na otázky týkající se obsahu vašich dokumentů.
                </li>
              </ol>
              
              <h3>Security and data protection</h3>
              <p>
                Vaše dokumenty jsou během celého procesu zpracování chráněny. Uplatňujeme přísná bezpečnostní 
                opatření, včetně:
              </p>
              <ul>
                <li>Documents are encrypted in transit and at rest</li>
                <li>Strict access controls on documents</li>
                <li>Regular security audits</li>
                <li>Automatic deletion of temporary files that are no longer needed</li>
              </ul>
              
              <h3>Data ownership and use</h3>
              <p>
                Důležité je zdůraznit, že:
              </p>
              <ul>
                <li>You remain the sole owner of every uploaded document and its content</li>
                <li>We do not use your documents to train AI models for other customers</li>
                <li>The content of your documents is not shared with third parties</li>
                <li>You have the right to have all your documents and related data deleted from our systems</li>
              </ul>
              
              <h3>Purpose of processing</h3>
              <p>
                Vaše dokumenty zpracováváme výhradně za účelem:
              </p>
              <ul>
                <li>Providing the requested AI chatbot service capable of answering questions about your documents</li>
                <li>Improving the accuracy and relevance of answers to questions about your documents</li>
                <li>Enabling search and information retrieval across your documents</li>
              </ul>
              
              <h3>Retention period</h3>
              <p>
                Dokumenty a související data jsou uchovávány po dobu trvání vaší služby a jsou 
                vymazány po ukončení vašeho účtu nebo na vaši žádost.
              </p>
              
              <h3>Kontakt</h3>
              <p>
                S jakýmikoli dotazy týkajícími se zpracování vašich dokumentů se prosím 
                obraťte na info@docusage.cz.
              </p>
            </>
          ) : (
            <>
              <h2>How DocuSage Processes Your Documents</h2>
              <p>
                DocuSage is an intelligent chatbot that learns from your PDF documents and 
                helps answer questions related to their content. For our service to function properly, 
                we need to process and analyze the content of your uploaded documents.
              </p>
              
              <h3>Document Processing Workflow</h3>
              <p>
                When you upload a PDF document to DocuSage, we perform the following steps:
              </p>
              <ol>
                <li>
                  <strong>Text Extraction</strong> - First, we extract all text from the uploaded PDF file. 
                  For standard documents, we use regular PDF text extraction. For scanned documents or 
                  images, we use advanced OCR (Optical Character Recognition) technologies.
                </li>
                <li>
                  <strong>Analysis and Indexing</strong> - The text is analyzed and indexed for efficient searching. 
                  We recognize key topics, entities, and relationships within the text.
                </li>
                <li>
                  <strong>Embeddings Generation</strong> - We create vector representations (embeddings) of the content, 
                  allowing the AI model to accurately understand the semantic meaning of the text.
                </li>
                <li>
                  <strong>AI Model Integration</strong> - The processed and indexed content is linked to our 
                  AI language model, which is capable of answering questions about the content of your documents.
                </li>
              </ol>
              
              <h3>Data Security and Protection</h3>
              <p>
                Your documents are protected throughout the entire processing workflow. We implement strict security 
                measures, including:
              </p>
              <ul>
                <li>Document encryption during transmission and storage</li>
                <li>Strict access controls to documents</li>
                <li>Regular security audits</li>
                <li>Automatic deletion of unnecessary temporary files</li>
              </ul>
              
              <h3>Data Ownership and Usage</h3>
              <p>
                It's important to emphasize that:
              </p>
              <ul>
                <li>You remain the exclusive owner of all uploaded documents and their content</li>
                <li>We do not use your documents to train our AI models for other customers</li>
                <li>The content of your documents is not shared with third parties</li>
                <li>You have the right to delete all your documents and related data from our systems</li>
              </ul>
              
              <h3>Purpose of Processing</h3>
              <p>
                We process your documents solely for the purpose of:
              </p>
              <ul>
                <li>Providing the requested AI chatbot service capable of answering questions about your documents</li>
                <li>Improving the accuracy and relevance of responses to queries related to your documents</li>
                <li>Enabling searching and information retrieval from your documents</li>
              </ul>
              
              <h3>Retention Period</h3>
              <p>
                Documents and related data are retained for the duration of your service and are 
                deleted after termination of your account or at your request.
              </p>
              
              <h3>Contact</h3>
              <p>
                For any questions regarding the processing of your documents, please 
                contact info@docusage.cz.
              </p>
            </>
          )}
          
          <div className="mt-8 text-center">
            <Link href="/" className="text-primary hover:underline">
              {language === 'cs' ? 'Back to home page' : 'Back to home page'}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}