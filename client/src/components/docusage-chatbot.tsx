import { useEffect } from 'react';

interface DocuSageChatbotProps {
  token: string;
  color?: string;
  theme?: 'light' | 'dark';
  chatbotName?: string;
  welcomeMessage?: string;
  notificationEnabled?: boolean;
  notificationDelay?: number;
  notificationText?: string;
}

export function DocuSageChatbot({
  token,
  color = 'blue',
  theme = 'light',
  chatbotName = 'DocuSage Assistant',
  welcomeMessage = 'Hi, how can I help you?',
  notificationEnabled = true,
  notificationDelay = 5,
  notificationText = 'Need some advice?'
}: DocuSageChatbotProps) {
  useEffect(() => {
    // Dynamically create a script tag
    const script = document.createElement('script');
    script.src = 'https://docusage.cz/embed.js';
    script.dataset.token = token;
    script.dataset.color = color;
    script.dataset.theme = theme;
    script.dataset.chatbotName = chatbotName;
    script.dataset.welcomeMessage = welcomeMessage;
    script.dataset.notificationEnabled = notificationEnabled.toString();
    script.dataset.notificationDelay = notificationDelay.toString();
    script.dataset.notificationText = notificationText;
    
    // Append the script to the end of body
    document.body.appendChild(script);

    // Cleanup function for when the component unmounts
    return () => {
      document.body.removeChild(script);
      
      // Also clean up any chatbot elements the script may have created
      const chatbotElements = document.querySelectorAll('.docusage-chatbot-widget, .docusage-chatbot-button');
      chatbotElements.forEach(element => {
        if (element.parentNode) {
          element.parentNode.removeChild(element);
        }
      });
    };
  }, [token, color, theme, chatbotName, welcomeMessage, notificationEnabled, notificationDelay, notificationText]);

  return null; // This component has no UI of its own
}