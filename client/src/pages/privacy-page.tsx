import { useLanguage } from "@/hooks/use-language";
import Navbar from "@/components/navbar";
import { Link } from "wouter";
import { SEO } from "@/components/seo";

/**
 * PRIVACY POLICY TEMPLATE.
 *
 * DocuSage is open-source software. The data controller is always
 * the OPERATOR of the given instance, not the authors of the software. Before going
 * live, adjust this template to reflect reality (contact, data location,
 * AI providers used, retention period) and have a lawyer review it.
 * Fill in the details below in the OPERATOR constant.
 */
const OPERATOR = {
  name: "[fill in the operator name]",
  email: "[fill in the contact email]",
};

export default function PrivacyPage() {
  const { language } = useLanguage();

  return (
    <div className="min-h-screen bg-gray-50">
      <SEO
        title={language === 'cs' ? 'Privacy Policy - DocuSage' : 'Privacy Policy - DocuSage'}
        description={language === 'cs' ? 'How the operator of this DocuSage instance processes and protects your personal data, and how uploaded documents are used.' : 'Information about how the operator of this DocuSage instance processes and protects your personal data and how uploaded documents are used.'}
      />
      <Navbar />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-3xl font-bold text-center mb-8 text-gray-900">
          {language === 'cs' ? 'Privacy' : 'Privacy Policy'}
        </h1>

        <div className="bg-white p-6 rounded-lg shadow-sm prose prose-slate max-w-none">
          {language === 'cs' ? (
            <>
              <h2>Privacy policy</h2>
              <p>
                Správcem osobních údajů zpracovávaných v této instanci služby je její provozovatel,
                {' '}<strong>{OPERATOR.name}</strong> (dále jen „provozovatel" nebo „my").
                Tyto zásady stanoví základ, na kterém provozovatel zpracovává jakékoli osobní údaje,
                které od vás získá nebo které mu poskytnete.
              </p>
              <p>
                DocuSage je open-source software šířený pod licencí MIT. Autoři a přispěvatelé
                software nejsou správci ani zpracovateli vašich údajů, neprovozují tuto instanci
                a neodpovídají za způsob, jakým ji provozovatel používá. S dotazy ohledně zpracování
                svých údajů se obracejte výhradně na provozovatele.
              </p>

              <h3>What information we collect</h3>
              <p>
                Provozovatel může shromažďovat a zpracovávat následující údaje o vás:
              </p>
              <ul>
                <li>Information you provide by filling in forms on the website</li>
                <li>Information you provide when registering an account</li>
                <li>Records of correspondence if you contact the operator</li>
                <li>Details of your visits to the website</li>
                <li>The content of PDF documents uploaded to the service and the questions asked of the chatbot</li>
              </ul>

              <h3>How we use your information</h3>
              <ul>
                <li>To present the website content effectively</li>
                <li>To provide the services you requested</li>
                <li>To inform you about changes to the service</li>
              </ul>

              <h3>Disclosure to third parties</h3>
              <p>
                Pro generování odpovědí služba předává obsah dokumentů a vašich dotazů
                poskytovateli umělé inteligence, kterého provozovatel v nastavení zvolil
                (např. OpenAI, Google nebo Azure OpenAI). Tito poskytovatelé mohou data
                zpracovávat i mimo Evropský hospodářský prostor. Konkrétní seznam použitých
                poskytovatelů a podmínky předání sdělí provozovatel na vyžádání.
              </p>

              <h3>Where your personal data is stored</h3>
              <p>
                Data jsou uložena v infrastruktuře, kterou zvolil provozovatel. Mohou být
                přenášena a ukládána v destinaci mimo Evropský hospodářský prostor (EHP).
              </p>

              <h3>Security</h3>
              <p>
                Přenos informací přes internet není zcela bezpečný. Přestože se provozovatel
                bude snažit vaše osobní údaje chránit, nemůže zaručit bezpečnost dat přenášených
                na webové stránky; jakýkoli přenos je na vaše vlastní riziko.
              </p>

              <h3>Your rights</h3>
              <p>
                Máte právo na přístup ke svým údajům, jejich opravu, výmaz a na vznesení námitky
                proti zpracování. Svá práva můžete uplatnit u provozovatele na adrese
                {' '}<strong>{OPERATOR.email}</strong>.
              </p>

              <h3>Changes to this policy</h3>
              <p>
                Jakékoli budoucí změny těchto zásad zveřejní provozovatel na této stránce.
              </p>

              <h3>Kontakt</h3>
              <p>
                Otázky, komentáře a žádosti týkající se těchto zásad adresujte provozovateli na
                {' '}<strong>{OPERATOR.email}</strong>.
              </p>
            </>
          ) : (
            <>
              <h2>Privacy Policy</h2>
              <p>
                The controller of personal data processed in this instance of the service is its
                operator, <strong>{OPERATOR.name}</strong> (the "operator" or "we"). This policy
                sets out the basis on which the operator processes any personal data it collects
                from you or that you provide to it.
              </p>
              <p>
                DocuSage is open-source software distributed under the MIT license. The authors and
                contributors of the software are neither controllers nor processors of your data,
                do not operate this instance, and are not responsible for how the operator uses it.
                Please direct any questions about the processing of your data to the operator only.
              </p>

              <h3>Information We Collect</h3>
              <p>
                The operator may collect and process the following data about you:
              </p>
              <ul>
                <li>Information you provide by filling in forms on the website</li>
                <li>Information you provide when registering for an account</li>
                <li>Records of correspondence if you contact the operator</li>
                <li>Details of your visits to the website</li>
                <li>Content of PDF documents uploaded to the service and questions asked of the chatbot</li>
              </ul>

              <h3>How We Use Your Information</h3>
              <ul>
                <li>To ensure effective presentation of the website content</li>
                <li>To provide the services you have requested</li>
                <li>To inform you about changes to the service</li>
              </ul>

              <h3>Disclosure to Third Parties</h3>
              <p>
                To generate answers, the service sends the content of documents and your questions
                to the artificial intelligence provider selected by the operator (e.g. OpenAI,
                Google, or Azure OpenAI). These providers may process data outside the European
                Economic Area. The operator will disclose the specific providers used and the terms
                of such transfers on request.
              </p>

              <h3>Where We Store Your Personal Data</h3>
              <p>
                Data is stored in infrastructure chosen by the operator. It may be transferred to
                and stored at a destination outside the European Economic Area (EEA).
              </p>

              <h3>Security</h3>
              <p>
                The transmission of information via the internet is not completely secure. Although
                the operator will do its best to protect your personal data, it cannot guarantee the
                security of your data transmitted to the website; any transmission is at your own risk.
              </p>

              <h3>Your Rights</h3>
              <p>
                You have the right to access, rectify, and erase your data, and to object to its
                processing. You can exercise these rights with the operator at
                {' '}<strong>{OPERATOR.email}</strong>.
              </p>

              <h3>Changes to This Policy</h3>
              <p>
                Any future changes to this policy will be posted on this page by the operator.
              </p>

              <h3>Contact</h3>
              <p>
                Questions, comments, and requests regarding this policy should be addressed to the
                operator at <strong>{OPERATOR.email}</strong>.
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
