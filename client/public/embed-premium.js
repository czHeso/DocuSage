(() => {
  /**
   * Escapuje HTML znaky.
   *
   * Every piece of text coming from a visitor, from uploaded documents, or from
   * the AI must pass through this function BEFORE it is inserted into innerHTML.
   * Otherwise executable code (XSS) could be smuggled into the host page – and the widget runs on
   * third-party sites, so the impact would fall on that site's operator.
   */
  const escapeHtml = (value) =>
    String(value === null || value === undefined ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  // Create the CSS styles for the premium chatbot (inspired by Gleap.io)
  const createPremiumStyles = (primaryColor = "#2563eb", theme = "light") => {
    // Colours based on the theme
    const isDarkTheme = theme === "dark";
    const bgColor = isDarkTheme ? "#1a1a1a" : "#ffffff";
    const textColor = isDarkTheme ? "#f9fafb" : "#111827";
    const secondaryBgColor = isDarkTheme ? "#2a2a2a" : "#f8fafc";
    const borderColor = isDarkTheme ? "#374151" : "#e5e7eb";
    const shadowColor = isDarkTheme
      ? "rgba(0, 0, 0, 0.5)"
      : "rgba(0, 0, 0, 0.1)";

    return `
      .docusage-chat-widget-premium {
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 9999;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
        direction: ltr;
      }
      
      /* Premium floating button */
      .docusage-chat-bubble-premium {
        position: relative;
        width: 56px;
        height: 56px;
        border-radius: 16px;
        background: linear-gradient(135deg, ${primaryColor} 0%, #667eea 50%, #764ba2 100%);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        box-shadow: 0 12px 40px rgba(103, 58, 183, 0.4), 0 4px 16px rgba(37, 99, 235, 0.3);
        transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        border: none;
        backdrop-filter: blur(10px);
        overflow: hidden;
      }
      
      .docusage-chat-bubble-premium::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        border-radius: inherit;
        background: linear-gradient(45deg, transparent 30%, rgba(255, 255, 255, 0.2) 50%, transparent 70%);
        opacity: 0;
        transition: opacity 0.3s ease;
      }
      
      .docusage-chat-bubble-premium:hover {
        transform: translateY(-4px) scale(1.08);
        box-shadow: 0 20px 60px rgba(103, 58, 183, 0.5), 0 8px 25px rgba(37, 99, 235, 0.4);
      }
      
      .docusage-chat-bubble-premium:hover::before {
        opacity: 1;
      }
      
      .docusage-chat-bubble-premium:active {
        transform: translateY(-2px) scale(1.05);
      }
      
      .docusage-chat-icon-premium {
        width: 24px;
        height: 24px;
        fill: white;
        transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        z-index: 1;
        position: relative;
      }
      
      .docusage-chat-bubble-premium:hover .docusage-chat-icon-premium {
        transform: scale(1.15) rotate(15deg);
      }
      
      /* Premium notification bubble */
      .docusage-notification-bubble-premium {
        position: absolute;
        top: -110px;
        right: 0;
        background: linear-gradient(135deg, ${bgColor} 0%, ${secondaryBgColor} 100%);
        color: ${textColor};
        padding: 20px 24px;
        border-radius: 20px;
        box-shadow: 0 20px 60px ${shadowColor}, 0 8px 30px rgba(0, 0, 0, 0.1);
        font-size: 14px;
        max-width: 300px;
        opacity: 0;
        transform: translateY(15px) scale(0.85);
        transition: all 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        pointer-events: none;
        z-index: 10000;
        text-align: left;
        word-wrap: break-word;
        white-space: normal;
        line-height: 1.6;
        border: 2px solid rgba(103, 58, 183, 0.1);
        backdrop-filter: blur(20px);
      }
      
      .docusage-notification-bubble-premium::after {
        content: '';
        position: absolute;
        bottom: -12px;
        right: 32px;
        width: 24px;
        height: 24px;
        background: linear-gradient(135deg, ${bgColor} 0%, ${secondaryBgColor} 100%);
        border-right: 2px solid rgba(103, 58, 183, 0.1);
        border-bottom: 2px solid rgba(103, 58, 183, 0.1);
        transform: rotate(45deg);
      }
      
      .docusage-notification-bubble-premium.active {
        opacity: 1;
        transform: translateY(0) scale(1);
        animation: premium-float 6s ease-in-out infinite;
      }
      
      @keyframes premium-float {
        0%, 100% { transform: translateY(0) scale(1); }
        50% { transform: translateY(-8px) scale(1.02); }
      }
      
      /* Premium chat container - flexbox layout */
      .docusage-chat-container-premium {
        position: absolute;
        bottom: 80px;
        right: 0;
        width: 400px;
        height: 600px;
        background: linear-gradient(135deg, ${bgColor} 0%, ${secondaryBgColor} 100%);
        border-radius: 24px;
        box-shadow: 0 30px 80px ${shadowColor}, 0 12px 40px rgba(0, 0, 0, 0.15);
        border: 2px solid rgba(103, 58, 183, 0.1);
        opacity: 0;
        transform: translateY(30px) scale(0.9);
        transition: all 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        pointer-events: none;
        overflow: hidden;
        backdrop-filter: blur(30px);
        display: flex;
        flex-direction: column;
      }
      
      .docusage-chat-container-premium.active {
        opacity: 1;
        transform: translateY(0) scale(1);
        pointer-events: auto;
      }
      
      /* Premium header, simplified - reduced size */
      .docusage-chat-header-premium {
        background: linear-gradient(135deg, ${primaryColor} 0%, #667eea 50%, #764ba2 100%);
        color: white;
        padding: 16px 24px;
        display: flex;
        flex-direction: column;
        border-radius: 24px 24px 0 0;
        position: relative;
        overflow: hidden;
        flex-shrink: 0;
      }
      
      .docusage-chat-header-premium::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: linear-gradient(45deg, transparent 30%, rgba(255, 255, 255, 0.1) 50%, transparent 70%);
        animation: premium-header-shine 8s ease-in-out infinite;
      }
      
      @keyframes premium-header-shine {
        0%, 100% { transform: translateX(-150%); }
        50% { transform: translateX(150%); }
      }
      
      .docusage-chat-header-top-premium {
        display: flex;
        align-items: center;
        justify-content: space-between;
        z-index: 1;
        position: relative;
      }
      
      .docusage-chat-header-left-premium {
        display: flex;
        align-items: center;
        z-index: 1;
        position: relative;
      }
      
      .docusage-chat-title-premium {
        font-weight: 700;
        font-size: 18px;
        margin: 0;
        z-index: 1;
        position: relative;
      }
      
      .docusage-chat-close-premium {
        background: rgba(255, 255, 255, 0.2);
        border: none;
        color: white;
        width: 36px;
        height: 36px;
        border-radius: 12px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.3s ease;
        z-index: 1;
        position: relative;
      }
      
      .docusage-chat-close-premium:hover {
        background: rgba(255, 255, 255, 0.3);
        transform: scale(1.1);
      }
      
      /* Premium messages container - flex grow */
      .docusage-chat-messages-premium {
        overflow-y: auto;
        padding: 20px 24px;
        background: transparent;
        position: relative;
        flex: 1;
        min-height: 0;
      }
      
      .docusage-chat-messages-premium::-webkit-scrollbar {
        width: 6px;
      }
      
      .docusage-chat-messages-premium::-webkit-scrollbar-track {
        background: transparent;
      }
      
      .docusage-chat-messages-premium::-webkit-scrollbar-thumb {
        background: ${borderColor};
        border-radius: 3px;
      }
      
      .docusage-chat-messages-premium::-webkit-scrollbar-thumb:hover {
        background: ${primaryColor}80;
      }
      
      /* Premium message bubbles */
      .docusage-message-premium {
        margin-bottom: 16px;
        animation: premium-messageSlideIn 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      }
      
      @keyframes premium-messageSlideIn {
        from {
          opacity: 0;
          transform: translateY(20px) scale(0.9);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }
      
      .docusage-message-user-premium {
        text-align: right;
      }
      
      .docusage-message-bot-premium {
        text-align: left;
      }
      
      .docusage-message-content-premium {
        display: inline-block;
        max-width: 85%;
        padding: 16px 20px;
        border-radius: 20px;
        font-size: 14px;
        line-height: 1.6;
        word-wrap: break-word;
        position: relative;
      }
      
      .docusage-message-user-premium .docusage-message-content-premium {
        background: linear-gradient(135deg, ${primaryColor} 0%, #667eea 100%);
        color: white;
        border-bottom-right-radius: 8px;
        box-shadow: 0 4px 16px ${primaryColor}40;
      }
      
      .docusage-message-bot-premium .docusage-message-content-premium {
        background: ${bgColor};
        color: ${textColor};
        border: 2px solid ${borderColor};
        border-bottom-left-radius: 8px;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
      }
      
      /* Premium input container - fixed position */
      .docusage-chat-input-container-premium {
        padding: 20px 24px 12px 24px;
        background: ${bgColor};
        border-top: 2px solid ${borderColor};
        border-radius: 0 0 24px 24px;
        display: flex;
        gap: 16px;
        align-items: flex-end;
        flex-shrink: 0;
      }
      
      .docusage-chat-input-premium {
        flex: 1;
        border: 2px solid ${borderColor};
        border-radius: 20px;
        padding: 16px 20px;
        font-size: 14px;
        background: ${secondaryBgColor};
        color: ${textColor};
        resize: none;
        outline: none;
        transition: all 0.3s ease;
        min-height: 24px;
        max-height: 120px;
        font-family: inherit;
      }
      
      .docusage-chat-input-premium:focus {
        border-color: ${primaryColor};
        background: ${bgColor};
        box-shadow: 0 0 0 4px ${primaryColor}15;
      }
      
      .docusage-chat-input-premium::placeholder {
        color: ${isDarkTheme ? "#9ca3af" : "#6b7280"};
      }
      
      .docusage-chat-send-button-premium {
        width: 52px;
        height: 52px;
        border: none;
        border-radius: 16px;
        background: linear-gradient(135deg, ${primaryColor} 0%, #667eea 100%);
        color: white;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        box-shadow: 0 6px 20px ${primaryColor}40;
      }
      
      .docusage-chat-send-button-premium:hover {
        transform: scale(1.1) translateY(-2px);
        box-shadow: 0 8px 25px ${primaryColor}60;
      }
      
      .docusage-chat-send-button-premium:active {
        transform: scale(0.95);
      }
      
      .docusage-chat-send-button-premium:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        transform: none;
      }
      
      /* Premium disclaimer */
      .docusage-chat-disclaimer-premium {
        padding: 2px 28px 6px 28px;
        font-size: 10px;
        color: ${isDarkTheme ? "#9ca3af" : "#6b7280"};
        text-align: center;
        background: ${secondaryBgColor};
        border-radius: 0 0 24px 24px;
      }
      
      .docusage-chat-disclaimer-premium a {
        color: ${primaryColor};
        text-decoration: none;
        font-weight: 600;
      }
      
      .docusage-chat-disclaimer-premium a:hover {
        text-decoration: underline;
      }
      
      /* Loading animation for premium style */
      .docusage-typing-indicator-premium {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 16px 20px;
        background: ${bgColor};
        border: 2px solid ${borderColor};
        border-radius: 20px 20px 20px 8px;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
        margin-bottom: 16px;
      }
      
      .docusage-typing-dot-premium {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: linear-gradient(135deg, ${primaryColor} 0%, #667eea 100%);
        animation: premium-typing-bounce 1.6s ease-in-out infinite both;
      }
      
      .docusage-typing-dot-premium:nth-child(1) { animation-delay: -0.32s; }
      .docusage-typing-dot-premium:nth-child(2) { animation-delay: -0.16s; }
      
      @keyframes premium-typing-bounce {
        0%, 80%, 100% {
          transform: scale(0);
        }
        40% {
          transform: scale(1);
        }
      }
      
      /* Responsive design */
      @media (max-width: 480px) {
        .docusage-chat-widget-premium {
          bottom: 16px;
          right: 16px;
        }
        
        .docusage-chat-container-premium {
          width: calc(100vw - 32px);
          height: calc(100vh - 120px);
          bottom: 80px;
          right: 0;
        }
        
        .docusage-notification-bubble-premium {
          max-width: calc(100vw - 120px);
        }
      }
      
      /* Accessibility improvements */
      @media (prefers-reduced-motion: reduce) {
        .docusage-chat-bubble-premium,
        .docusage-chat-container-premium,
        .docusage-message-premium,
        .docusage-notification-bubble-premium {
          animation: none;
          transition: opacity 0.2s ease;
        }
      }
      
      /* Focus management */
      .docusage-chat-bubble-premium:focus,
      .docusage-chat-close-premium:focus,
      .docusage-chat-send-button-premium:focus {
        outline: 3px solid ${primaryColor};
        outline-offset: 2px;
      }
      
      /* Hidden state for quick actions when chat is active */
      .docusage-chat-container-premium.chat-active .docusage-quick-actions-premium {
        display: none;
      }
      
      .docusage-chat-container-premium.chat-active .docusage-chat-messages-premium {
        height: 380px;
        padding-top: 24px;
        margin-top: 0;
      }
      
      /* Premium rating overlay styles */
      .docusage-rating-overlay-premium {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: linear-gradient(135deg, ${bgColor} 0%, ${secondaryBgColor} 100%);
        border-radius: 20px;
        z-index: 1000;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 28px;
        text-align: center;
        backdrop-filter: blur(15px);
        border: 1px solid ${borderColor};
      }
      
      .docusage-rating-title-premium {
        color: ${textColor};
        font-size: 18px;
        font-weight: 700;
        margin-bottom: 28px;
        line-height: 1.4;
        background: linear-gradient(135deg, ${primaryColor}, #667eea);
        background-clip: text;
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
      }
      
      .docusage-rating-stars-premium {
        display: flex;
        gap: 12px;
        margin-bottom: 28px;
      }
      
      .docusage-rating-star-premium {
        width: 40px;
        height: 40px;
        cursor: pointer;
        color: #d1d5db;
        transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        transform-origin: center;
        position: relative;
      }
      
      .docusage-rating-star-premium:hover {
        color: #fbbf24;
        transform: scale(1.3) rotate(10deg);
        filter: drop-shadow(0 0 20px rgba(251, 191, 36, 0.6));
      }
      
      .docusage-rating-star-premium.active {
        color: #fbbf24;
        transform: scale(1.2);
        filter: drop-shadow(0 0 15px rgba(251, 191, 36, 0.5));
      }
      
      .docusage-rating-star-premium svg {
        width: 100%;
        height: 100%;
        fill: currentColor;
      }
      
      .docusage-rating-thank-you-premium {
        color: ${textColor};
        font-size: 18px;
        font-weight: 600;
        text-align: center;
        animation: docusage-premiumFadeIn 0.6s ease;
        background: linear-gradient(135deg, ${primaryColor}, #667eea);
        background-clip: text;
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
      }
      
      /* Multi-modal styles for the premium embed */
      .docusage-code-block-premium {
        background: ${isDarkTheme ? "#1f2937" : "#f8fafc"};
        border: 1px solid ${isDarkTheme ? "#374151" : "#e5e7eb"};
        border-radius: 12px;
        margin: 10px 0;
        overflow-x: auto;
        box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      }

      .docusage-code-block-premium pre {
        margin: 0;
        padding: 14px 16px;
        white-space: pre-wrap;
        word-wrap: break-word;
      }

      .docusage-code-block-premium code {
        font-family: 'Monaco', 'Consolas', 'Courier New', monospace;
        font-size: 13px;
        line-height: 1.5;
        color: ${isDarkTheme ? "#f9fafb" : "#1f2937"};
      }

      .docusage-inline-code-premium {
        background: linear-gradient(135deg, ${isDarkTheme ? "#374151" : "#f3f4f6"}, ${isDarkTheme ? "#4b5563" : "#f9fafb"});
        color: ${isDarkTheme ? "#f9fafb" : "#1f2937"};
        padding: 2px 8px;
        border-radius: 6px;
        font-family: 'Monaco', 'Consolas', 'Courier New', monospace;
        font-size: 13px;
        box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      }

      .docusage-table-container-premium {
        margin: 10px 0;
        overflow-x: auto;
        border-radius: 12px;
        border: 1px solid ${isDarkTheme ? "#374151" : "#e5e7eb"};
        box-shadow: 0 4px 12px rgba(0,0,0,0.08);
      }

      .docusage-table-premium {
        width: 100%;
        border-collapse: collapse;
        font-size: 14px;
      }

      .docusage-table-premium th {
        background: linear-gradient(135deg, ${primaryColor}15, ${primaryColor}08);
        color: ${isDarkTheme ? "#f9fafb" : primaryColor};
        padding: 12px 16px;
        text-align: left;
        font-weight: 600;
        border-bottom: 2px solid ${primaryColor}40;
      }

      .docusage-table-premium td {
        padding: 10px 16px;
        border-bottom: 1px solid ${isDarkTheme ? "#374151" : "#e5e7eb"};
        color: ${textColor};
        transition: background-color 0.2s ease;
      }

      .docusage-table-premium tr:hover td {
        background: ${isDarkTheme ? "#1f2937" : primaryColor}08;
      }

      .docusage-link-buttons-premium {
        margin-top: 10px;
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .docusage-link-button-premium:hover {
        transform: translateY(-2px) !important;
        box-shadow: 0 6px 16px rgba(0,0,0,0.2) !important;
      }

      @keyframes docusage-premiumFadeIn {
        from { 
          opacity: 0; 
          transform: translateY(30px) scale(0.9); 
        }
        50% {
          transform: translateY(-5px) scale(1.05);
        }
        to { 
          opacity: 1; 
          transform: translateY(0) scale(1); 
        }
      }
    `;
  };

  // Main function for creating the premium chatbot widget
  const createPremiumChatWidget = (
    primaryColor,
    theme,
    chatbotName,
    welcomeMessage,
    disclaimerText,
    notificationEnabled,
    notificationDelay,
    notificationText,
    hidePoweredBy,
  ) => {
    const widget = document.createElement("div");
    widget.className = "docusage-chat-widget-premium";
    widget.setAttribute("role", "complementary");
    widget.setAttribute("aria-label", "AI Chat Assistant");

    // Chat bubble button
    const bubble = document.createElement("div");
    bubble.className = "docusage-chat-bubble-premium";
    bubble.setAttribute("role", "button");
    bubble.setAttribute("tabindex", "0");
    bubble.setAttribute("aria-label", `Open ${chatbotName}`);
    bubble.innerHTML = `
      <svg class="docusage-chat-icon-premium" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2C6.48 2 2 6.48 2 12C2 13.54 2.36 14.99 3.01 16.26L2 22L7.74 20.99C9.01 21.64 10.46 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM12 20C10.74 20 9.54 19.68 8.5 19.13L8.19 18.95L4.55 19.83L5.43 16.19L5.25 15.88C4.7 14.84 4.38 13.64 4.38 12.38C4.38 7.94 7.94 4.38 12.38 4.38C16.82 4.38 20.38 7.94 20.38 12.38C20.38 16.82 16.82 20.38 12.38 20.38L12 20Z"/>
      </svg>
    `;

    // Chat container
    const container = document.createElement("div");
    container.className = "docusage-chat-container-premium";
    container.setAttribute("role", "dialog");
    container.setAttribute("aria-labelledby", "chat-title");
    container.setAttribute("aria-modal", "true");

    // Simple header, like the other chats
    const header = document.createElement("div");
    header.className = "docusage-chat-header-premium";
    header.innerHTML = `
      <div class="docusage-chat-header-top-premium">
        <div class="docusage-chat-header-left-premium">
          <div class="docusage-bot-icon-placeholder" style="display: none; width: 24px; height: 24px; margin-right: 8px;"></div>
          <h3 id="chat-title" class="docusage-chat-title-premium">${chatbotName}</h3>
        </div>
        <button class="docusage-chat-close-premium" aria-label="Close chat">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    `;



    // Messages container
    const messages = document.createElement("div");
    messages.className = "docusage-chat-messages-premium";
    messages.setAttribute("role", "log");
    messages.setAttribute("aria-live", "polite");
    messages.setAttribute("aria-label", "Chat messages");

    // Input container
    const inputContainer = document.createElement("div");
    inputContainer.className = "docusage-chat-input-container-premium";

    const input = document.createElement("textarea");
    input.className = "docusage-chat-input-premium";
    input.placeholder = "Type a message...";
    input.setAttribute("aria-label", "Type a message");
    input.rows = 1;

    const sendButton = document.createElement("button");
    sendButton.className = "docusage-chat-send-button-premium";
    sendButton.setAttribute("aria-label", "Send message");
    sendButton.innerHTML = `
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="22" y1="2" x2="11" y2="13"></line>
        <polyline points="22,2 15,22 11,13 2,9 22,2"></polyline>
      </svg>
    `;

    inputContainer.appendChild(input);
    inputContainer.appendChild(sendButton);

    // Disclaimer
    const disclaimer = document.createElement("div");
    disclaimer.className = "docusage-chat-disclaimer-premium";
    disclaimer.innerHTML =
      escapeHtml(disclaimerText) + (hidePoweredBy ? "" : " | Powered by DocuSage");

    // Notification bubble
    const notificationBubble = document.createElement("div");
    notificationBubble.className = "docusage-notification-bubble-premium";
    notificationBubble.textContent = notificationText;
    notificationBubble.setAttribute("role", "status");
    notificationBubble.setAttribute("aria-live", "polite");

    // Assemble
    container.appendChild(header);
    container.appendChild(messages);
    container.appendChild(inputContainer);
    container.appendChild(disclaimer);

    widget.appendChild(container);
    widget.appendChild(bubble);
    widget.appendChild(notificationBubble);

    return {
      widget,
      bubble,
      container,
      header,
      messages,
      input,
      sendButton,
      notificationBubble,
    };
  };

  // Inicializace premium chatbotu
  const initPremiumChatBot = () => {
    // Read all parameters from the script attributes
    const script =
      document.currentScript || document.querySelector("script[data-token]");

    if (!script) {
      console.error(
        "DocuSage Premium Chatbot: could not find a script element with a data-token attribute.",
      );
      return;
    }
    const token = script.getAttribute("data-token");
    const color = script.getAttribute("data-color") || "blue";
    const theme = script.getAttribute("data-theme") || "light";
    const chatbotName =
      script.getAttribute("data-chatbot-name") || "DocuSage Asistent";
    const welcomeMessage =
      script.getAttribute("data-welcome-message") ||
      "Hello, how can I help you?";
    const disclaimerText =
      script.getAttribute("data-disclaimer-text") ||
      "Answers are generated by AI and may not always be accurate";
    // Labels for the contact form offered after an unanswered question. The
    // prompt and the thank-you come from the project settings; these are field
    // labels, the same for everyone, so they live on the tag.
    const leadEmailLabel = script.getAttribute("data-lead-email-label") || "Your email";
    const leadNameLabel = script.getAttribute("data-lead-name-label") || "Your name (optional)";
    const leadMessageLabel = script.getAttribute("data-lead-message-label") || "Anything else? (optional)";
    const leadSubmitLabel = script.getAttribute("data-lead-submit-label") || "Send";

    const notificationEnabled =
      script.getAttribute("data-notification-enabled") === "true";
    const notificationDelay =
      parseInt(script.getAttribute("data-notification-delay")) || 15;
    const notificationText =
      script.getAttribute("data-notification-text") ||
      "Need help with anything?";
    
    // Rating system parameters
    const ratingEnabled = script.getAttribute("data-rating-enabled") !== "false";
    const ratingPromptMessage = script.getAttribute("data-rating-prompt-message") || "Please rate our conversation";
    const ratingThankYouMessage = script.getAttribute("data-rating-thank-you-message") || "Thank you for your rating!";

    if (!token) {
      console.error("DocuSage: missing data-token attribute");
      return;
    }

    // Color mapping
    const colorMap = {
      blue: "#2563eb",
      green: "#16a34a",
      red: "#dc2626",
      purple: "#9333ea",
      orange: "#ea580c",
      pink: "#db2777",
      indigo: "#4f46e5",
    };

    const primaryColor = colorMap[color] || color;

    // Add the CSS styles
    const styleId = "docusage-premium-styles";
    let existingStyle = document.getElementById(styleId);
    if (existingStyle) {
      existingStyle.remove();
    }

    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = createPremiumStyles(primaryColor, theme);
    document.head.appendChild(style);

    // Read the hidePoweredBy parameter
    const hidePoweredBy =
      script.getAttribute("data-hide-powered-by") === "true";

    // Create the widget structure
    const {
      widget,
      bubble,
      container,
      messages,
      input,
      sendButton,
      notificationBubble,
    } = createPremiumChatWidget(
      primaryColor,
      theme,
      chatbotName,
      welcomeMessage,
      disclaimerText,
      notificationEnabled,
      notificationDelay,
      notificationText,
      hidePoweredBy,
    );

    // Add to the DOM
    document.body.appendChild(widget);

    // Event handlers
    let isOpen = false;
    let sessionId = null;
    let chatStarted = false;
    let hasRated = false;

    // Rating system functions for premium embed
    const showRatingPromptPremium = () => {
      const overlay = document.createElement('div');
      overlay.className = 'docusage-rating-overlay-premium';
      
      overlay.innerHTML = `
        <div class="docusage-rating-title-premium">${ratingPromptMessage}</div>
        <div class="docusage-rating-stars-premium">
          ${[1, 2, 3, 4, 5].map(num => `
            <div class="docusage-rating-star-premium" data-rating="${num}">
              <svg viewBox="0 0 24 24">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
              </svg>
            </div>
          `).join('')}
        </div>
      `;
      
      container.appendChild(overlay);
      
      // Handle star clicks
      overlay.querySelectorAll('.docusage-rating-star-premium').forEach(star => {
        star.addEventListener('click', (e) => {
          const rating = parseInt(e.currentTarget.dataset.rating);
          submitRatingPremium(rating);
          showThankYouMessagePremium(overlay);
        });
        
        star.addEventListener('mouseenter', (e) => {
          const rating = parseInt(e.currentTarget.dataset.rating);
          highlightStarsPremium(overlay, rating);
        });
      });
      
      overlay.addEventListener('mouseleave', () => {
        highlightStarsPremium(overlay, 0);
      });
    };
    
    const highlightStarsPremium = (overlay, rating) => {
      overlay.querySelectorAll('.docusage-rating-star-premium').forEach((star, index) => {
        if (index < rating) {
          star.classList.add('active');
        } else {
          star.classList.remove('active');
        }
      });
    };
    
    const submitRatingPremium = async (rating) => {
      try {
        let apiUrl;
        const script = document.currentScript || document.querySelector("script[data-token]");
        
        try {
          if (script && script.src) {
            const scriptUrl = new URL(script.src);
            apiUrl = new URL("/api/chat-embed/rating", scriptUrl.origin);
          } else {
            apiUrl = new URL("/api/chat-embed/rating", window.location.origin);
          }
        } catch (urlError) {
          apiUrl = new URL("/api/chat-embed/rating", window.location.origin);
        }
        
        await fetch(apiUrl.toString(), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            token: token,
            sessionId: sessionId,
            rating: rating
          }),
        });
        
        hasRated = true;
      } catch (error) {
        console.error('DocuSage Premium Rating: Error submitting rating:', error);
      }
    };
    
    const showThankYouMessagePremium = (overlay) => {
      overlay.innerHTML = `
        <div class="docusage-rating-thank-you-premium">${ratingThankYouMessage}</div>
      `;
      
      setTimeout(() => {
        overlay.remove();
        container.classList.remove("active");
        isOpen = false;
      }, 2000);
    };

    const toggleChat = () => {
      isOpen = !isOpen;
      container.classList.toggle("active", isOpen);

      if (isOpen) {
        input.focus();
        // Hide the notification while the chat is open
        notificationBubble.classList.remove("active");
        // Show the welcome message on first open
        if (!chatStarted) {
          startChat();
        }
      } else {
        // Check if rating is enabled and we have messages
        if (ratingEnabled && sessionId && messages.children.length > 1) {
          showRatingPromptPremium();
        }
      }
    };

    const closeChat = () => {
      if (ratingEnabled && sessionId && !hasRated) {
        showRatingPromptPremium();
      } else {
        isOpen = false;
        container.classList.remove("active");
      }
    };

    const startChat = (message) => {
      if (!chatStarted) {
        chatStarted = true;
        container.classList.add("chat-active");

        // Add welcome message to chat
        const welcomeMsg = document.createElement("div");
        welcomeMsg.className =
          "docusage-message-premium docusage-message-bot-premium";
        welcomeMsg.innerHTML = `<div class="docusage-message-content-premium">${escapeHtml(welcomeMessage)}</div>`;
        messages.appendChild(welcomeMsg);
      }

      if (message) {
        input.value = message;
        sendMessage();
      }
    };

    // Click handlers
    bubble.addEventListener("click", toggleChat);
    bubble.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggleChat();
      }
    });

    const closeButton = container.querySelector(".docusage-chat-close-premium");
    closeButton.addEventListener("click", closeChat);
    closeButton.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        closeChat();
      }
    });



    // Auto-resize textarea
    input.addEventListener("input", () => {
      input.style.height = "auto";
      input.style.height = Math.min(input.scrollHeight, 120) + "px";
    });

    // Send message functionality
    // Multi-modal content formatting function (Premium)
    const formatMultiModalContentPremium = (text) => {
      // Escape the HTML first, only then apply markdown formatting –
      // otherwise the document content or the AI answer could turn into executable code.
      text = escapeHtml(text);

      // Detect links
      const urlRegex = /(https?:\/\/[^\s]+)/g;
      let urls = [];
      let formattedText = text;

      // Extract URLs
      const matches = text.match(urlRegex);
      if (matches) {
        urls = matches;
        // Replace links in the text with placeholders
        matches.forEach((url, index) => {
          formattedText = formattedText.replace(url, `__URL_${index}__`);
        });
      }

      // Detect code (markdown style ```code``` or `code`)
      formattedText = formattedText.replace(/```([\s\S]*?)```/g, '<div class="docusage-code-block-premium"><pre><code>$1</code></pre></div>');
      formattedText = formattedText.replace(/`([^`]+)`/g, '<code class="docusage-inline-code-premium">$1</code>');

      // Detect tables (markdown style)
      const tableRegex = /(\|[^|\n]*\|[^|\n]*\|[\s\S]*?)(?=\n\n|\n$|$)/g;
      formattedText = formattedText.replace(tableRegex, (match) => {
        const rows = match.trim().split('\n');
        if (rows.length < 2) return match;
        
        let tableHTML = '<div class="docusage-table-container-premium"><table class="docusage-table-premium">';
        rows.forEach((row, index) => {
          const cells = row.split('|').filter(cell => cell.trim() !== '');
          if (index === 0) {
            tableHTML += '<thead><tr>';
            cells.forEach(cell => {
              tableHTML += `<th>${cell.trim()}</th>`;
            });
            tableHTML += '</tr></thead><tbody>';
          } else if (index === 1 && row.includes('---')) {
            // Skip separator row
          } else {
            tableHTML += '<tr>';
            cells.forEach(cell => {
              tableHTML += `<td>${cell.trim()}</td>`;
            });
            tableHTML += '</tr>';
          }
        });
        tableHTML += '</tbody></table></div>';
        return tableHTML;
      });

      // Basic markdown formatting
      formattedText = formattedText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      formattedText = formattedText.replace(/\*(.*?)\*/g, '<em>$1</em>');
      formattedText = formattedText.replace(/\n/g, '<br>');

      return { formattedText, urls };
    };

    /**
     * Offers a contact form after a question the chatbot could not answer.
     *
     * Whether to show it is decided by the server, which sends leadCapture on
     * the chat response. The widget renders what it is given and judges nothing:
     * which phrases count as a failure is a server-side question, and a widget
     * cached in somebody's browser would never learn a new one.
     */
    const showLeadForm = (config, question) => {
      const container = document.createElement("div");
      container.className = "docusage-lead-form-premium";
      container.style.cssText = `
        margin: 0 0 12px 0;
        padding: 12px;
        border: 1px solid rgba(0,0,0,0.1);
        border-radius: 12px;
        background: rgba(0,0,0,0.02);
        font-size: 13px;
      `;

      const prompt = document.createElement("div");
      prompt.textContent = config.prompt || "Leave us your email and we will get back to you.";
      prompt.style.cssText = "margin-bottom: 8px;";
      container.appendChild(prompt);

      const form = document.createElement("form");
      form.style.cssText = "display: flex; flex-direction: column; gap: 6px;";

      const field = (type, placeholder, required) => {
        const input = document.createElement(type === "textarea" ? "textarea" : "input");
        if (type !== "textarea") input.type = type;
        input.placeholder = placeholder;
        input.required = !!required;
        if (type === "textarea") input.rows = 2;
        input.style.cssText = `
          padding: 8px 10px;
          border: 1px solid rgba(0,0,0,0.15);
          border-radius: 8px;
          font: inherit;
          font-size: 13px;
          resize: vertical;
          box-sizing: border-box;
          width: 100%;
        `;
        form.appendChild(input);
        return input;
      };

      const emailInput = field("email", leadEmailLabel, true);
      const nameInput = field("text", leadNameLabel, false);
      const messageInput = field("textarea", leadMessageLabel, false);

      const submit = document.createElement("button");
      submit.type = "submit";
      submit.textContent = leadSubmitLabel;
      submit.style.cssText = `
        padding: 8px 12px;
        border: none;
        border-radius: 8px;
        background: ${primaryColor || "#2563eb"};
        color: white;
        font: inherit;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
      `;
      form.appendChild(submit);

      const error = document.createElement("div");
      error.style.cssText = "color: #b91c1c; font-size: 12px; display: none;";
      form.appendChild(error);

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        submit.disabled = true;
        error.style.display = "none";

        try {
          const response = await fetch(leadApiUrl(), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            mode: "cors",
            credentials: "omit",
            body: JSON.stringify({
              token: currentToken,
              sessionId,
              email: emailInput.value,
              name: nameInput.value || undefined,
              message: messageInput.value || undefined,
              question,
              pageUrl: window.location.href,
            }),
          });

          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(data.message || "The details could not be sent.");

          // Replaced rather than hidden: no way to submit twice, and no doubt
          // about whether it went through.
          container.textContent = data.message || config.thankYou || "Thank you, we will be in touch.";
          container.style.background = "rgba(16,185,129,0.08)";
        } catch (submitError) {
          error.textContent = submitError.message || "The details could not be sent.";
          error.style.display = "block";
          submit.disabled = false;
        }
      });

      container.appendChild(form);
      messages.appendChild(container);
      messages.scrollTop = messages.scrollHeight;
      emailInput.focus();
    };

    /** The lead endpoint sits next to the chat one, wherever that turned out to be. */
    const leadApiUrl = () => {
      const scriptElement = document.currentScript || document.querySelector("script[data-token]");
      try {
        const origin = scriptElement && scriptElement.src
          ? new URL(scriptElement.src).origin
          : window.location.origin;
        return new URL("/api/chat-embed/lead", origin).toString();
      } catch (urlError) {
        return new URL("/api/chat-embed/lead", window.location.origin).toString();
      }
    };

    /**
     * Renders a finished bot answer, with multi-modal formatting and links.
     *
     * Lifted out of sendMessage unchanged so that a streamed answer and a plain
     * one go through exactly the same rendering.
     */
    const renderBotMessage = (messageContent) => {
      const { formattedText, urls } = formatMultiModalContentPremium(messageContent);

      // Add the bot's answer with multi-modal support
      const botMessageDiv = document.createElement("div");
      botMessageDiv.className =
        "docusage-message-premium docusage-message-bot-premium";
      
      const contentDiv = document.createElement("div");
      contentDiv.className = "docusage-message-content-premium";
      
      let finalText = formattedText;
      // Replace the URL placeholders back
      urls.forEach((url, index) => {
        finalText = finalText.replace(`__URL_${index}__`, url);
      });
      
      contentDiv.innerHTML = finalText;
      
      // Add the link buttons
      if (urls.length > 0) {
        const linkContainer = document.createElement("div");
        linkContainer.className = "docusage-link-buttons-premium";
        linkContainer.style.cssText = `
          margin-top: 8px;
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        `;
        
        urls.forEach((url, index) => {
          const linkButton = document.createElement("a");
          linkButton.href = url;
          linkButton.target = "_blank";
          linkButton.rel = "noopener noreferrer";
          linkButton.className = "docusage-link-button-premium";
          linkButton.style.cssText = `
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 6px 12px;
            background: linear-gradient(135deg, ${primaryColor || '#2563eb'}, ${primaryColor || '#2563eb'}dd);
            color: white;
            text-decoration: none;
            border-radius: 16px;
            font-size: 12px;
            font-weight: 500;
            transition: all 0.2s ease;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          `;
          linkButton.innerHTML = `
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
              <polyline points="15,3 21,3 21,9"></polyline>
              <line x1="10" y1="14" x2="21" y2="3"></line>
            </svg>
            Odkaz ${index + 1}
          `;
          
          linkButton.addEventListener('mouseenter', () => {
            linkButton.style.transform = 'translateY(-1px)';
            linkButton.style.boxShadow = '0 4px 8px rgba(0,0,0,0.15)';
          });
          linkButton.addEventListener('mouseleave', () => {
            linkButton.style.transform = 'translateY(0)';
            linkButton.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
          });
          
          linkContainer.appendChild(linkButton);
        });
        
        contentDiv.appendChild(linkContainer);
      }
      
      botMessageDiv.appendChild(contentDiv);
      messages.appendChild(botMessageDiv);
      
      messages.scrollTop = messages.scrollHeight;
    };

    /**
     * Shows an answer while it is still being written.
     *
     * The partial text is set with textContent rather than innerHTML - it is
     * raw model output going into the page - and the finished string is handed
     * to renderBotMessage so the final result is formatted the usual way.
     */
    const createStreamingBotMessage = () => {
      const botMessageDiv = document.createElement("div");
      botMessageDiv.className = "docusage-message-premium docusage-message-bot-premium";

      const contentDiv = document.createElement("div");
      contentDiv.className = "docusage-message-content-premium";
      botMessageDiv.appendChild(contentDiv);
      messages.appendChild(botMessageDiv);

      let text = "";

      return {
        append(delta) {
          text += delta;
          contentDiv.textContent = text;
          messages.scrollTop = messages.scrollHeight;
        },
        text() {
          return text;
        },
        remove() {
          botMessageDiv.remove();
        },
      };
    };

    /**
     * Reads a server-sent event stream out of a fetch response.
     *
     * EventSource is GET-only and the question travels in a POST body, so the
     * framing is parsed by hand: events are separated by a blank line, and a
     * partial event stays in the buffer until the rest of it arrives.
     */
    const readEventStream = async (response, onEvent) => {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        let separator;
        while ((separator = buffer.indexOf("\n\n")) !== -1) {
          const raw = buffer.slice(0, separator);
          buffer = buffer.slice(separator + 2);

          let event = "message";
          const dataLines = [];

          raw.split("\n").forEach((line) => {
            if (line.startsWith("event:")) {
              event = line.slice(6).trim();
            } else if (line.startsWith("data:")) {
              dataLines.push(line.slice(5).trim());
            }
          });

          if (dataLines.length === 0) continue;

          try {
            onEvent(event, JSON.parse(dataLines.join("\n")));
          } catch (err) {
            console.warn("DocuSage: unreadable event on the stream", err);
          }
        }
      }
    };

    const sendMessage = async () => {
      const message = input.value.trim();
      if (!message) return;

      startChat();

      const userMessageDiv = document.createElement("div");
      userMessageDiv.className =
        "docusage-message-premium docusage-message-user-premium";
      userMessageDiv.innerHTML = `<div class="docusage-message-content-premium">${escapeHtml(message)}</div>`;
      messages.appendChild(userMessageDiv);

      input.value = "";
      input.style.height = "auto";

      // Show typing indicator
      const typingIndicator = document.createElement("div");
      typingIndicator.className = "docusage-typing-indicator-premium";
      typingIndicator.innerHTML = `
        <div class="docusage-typing-dot-premium"></div>
        <div class="docusage-typing-dot-premium"></div>
        <div class="docusage-typing-dot-premium"></div>
      `;
      messages.appendChild(typingIndicator);

      messages.scrollTop = messages.scrollHeight;

      try {
        // Read the token from the script (fixes a scope problem)
        const currentScript = document.currentScript || document.querySelector("script[data-token]");
        const currentToken = currentScript ? currentScript.getAttribute("data-token") : token;
        
        // Determine the correct API URL - copied from embed.js
        let apiUrl;
        try {
          const scriptSrc = currentScript.src;
          if (scriptSrc) {
            const scriptUrl = new URL(scriptSrc);
            apiUrl = new URL("/api/chat-embed", scriptUrl.origin);
          } else {
            apiUrl = new URL("/api/chat-embed", window.location.origin);
          }
        } catch (urlError) {
          apiUrl = new URL("/api/chat-embed", window.location.origin);
        }

        // Prepare the payload with the token
        const payload = JSON.stringify({
          message: message,
          token: currentToken,
          sessionId: sessionId,
        });

        const requestInit = {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
          },
          mode: "cors",
          cache: "no-cache",
          credentials: "omit",
          redirect: "follow",
          referrerPolicy: "no-referrer",
          body: payload,
        };

        // Try the streaming endpoint first and fall back to the plain one. The
        // fallback is not optional: this script lives in someone else's page and
        // in their visitors' caches, so it can be talking to a server that
        // predates /stream, or through a proxy that buffers the response.
        let streamed = null;
        let answerText = null;
        let leadCapture = null;

        try {
          const streamResponse = await fetch(
            apiUrl.toString() + "/stream",
            Object.assign({}, requestInit, {
              headers: {
                "Content-Type": "application/json",
                "Accept": "text/event-stream",
              },
            }),
          );

          if (!streamResponse.ok || !streamResponse.body) {
            throw new Error(`Streaming unavailable: ${streamResponse.status} ${streamResponse.statusText}`);
          }

          await readEventStream(streamResponse, (event, data) => {
            if (event === "session") {
              if (data.sessionId && !sessionId) {
                sessionId = data.sessionId;
              }
              return;
            }

            if (event === "delta") {
              if (!streamed) {
                // The indicator goes at the first token, not when the
                // connection opens - retrieval happens before any text exists.
                typingIndicator.remove();
                streamed = createStreamingBotMessage();
              }
              streamed.append(data.text || "");
              return;
            }

            if (event === "done") {
              answerText = (data.message && data.message.content) || (streamed ? streamed.text() : "");
              leadCapture = data.leadCapture || null;
              return;
            }

            if (event === "error") {
              throw new Error(data.message || "The server reported an error");
            }
          });

          if (answerText === null) {
            answerText = streamed ? streamed.text() : null;
            if (!answerText) {
              throw new Error("The stream ended before any answer arrived");
            }
          }
        } catch (streamError) {
          console.log("DocuSage: streaming unavailable, using the standard request", streamError.message);

          if (streamed) {
            // Tokens were already on screen. Asking again would charge the
            // project for a second answer and could show a different one.
            answerText = streamed.text();
          } else {
            const response = await fetch(apiUrl.toString(), requestInit);

            if (!response.ok) {
              throw new Error(`Network response was not ok: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();

            if (data.sessionId && !sessionId) {
              sessionId = data.sessionId;
            }

            answerText = data.message?.content || data.message || "I am sorry, an error occurred while processing your message.";
            leadCapture = data.leadCapture || null;
          }
        }

        // Remove typing indicator
        typingIndicator.remove();

        // Re-render through the normal path so a streamed answer is formatted
        // exactly like any other one.
        if (streamed) {
          streamed.remove();
        }
        renderBotMessage(answerText);

        // The server decides whether this answer failed and whether the project
        // collects contact details at all.
        if (leadCapture) {
          showLeadForm(leadCapture, message);
        }
      } catch (error) {
        console.error("DocuSage chat error:", error);

        // Remove typing indicator
        typingIndicator.remove();

        const errorDiv = document.createElement("div");
        errorDiv.className =
          "docusage-message-premium docusage-message-bot-premium";
        errorDiv.innerHTML = `<div class="docusage-message-content-premium">I am sorry, an error occurred while contacting the server.</div>`;
        messages.appendChild(errorDiv);
      }

      messages.scrollTop = messages.scrollHeight;
    };

    sendButton.addEventListener("click", sendMessage);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    // Notification system
    if (notificationEnabled && notificationDelay > 0) {
      setTimeout(() => {
        if (!isOpen) {
          notificationBubble.classList.add("active");

          // Auto-hide notification after 8 seconds
          setTimeout(() => {
            notificationBubble.classList.remove("active");
          }, 8000);
        }
      }, notificationDelay * 1000);
    }

    // Click notification to open chat
    notificationBubble.addEventListener("click", () => {
      notificationBubble.classList.remove("active");
      if (!isOpen) {
        toggleChat();
      }
    });

    // Function for loading and displaying the bot icon
    const loadBotIcon = async () => {
      try {
        // Determine the URL of the bot icon
        let baseUrl = null;
        
        // Find the script carrying the token to determine the base URL
        const tokenScript = document.querySelector("script[data-token]");
        if (tokenScript && tokenScript.src) {
          const scriptUrl = new URL(tokenScript.src);
          baseUrl = scriptUrl.origin;
        }
        
        if (!baseUrl && document.currentScript && document.currentScript.src) {
          const scriptUrl = new URL(document.currentScript.src);
          baseUrl = scriptUrl.origin;
        }
        
        if (!baseUrl) {
          const allScripts = Array.from(document.querySelectorAll("script"));
          for (const script of allScripts) {
            if (script.src && script.src.includes("embed-premium.js")) {
              const scriptUrl = new URL(script.src);
              baseUrl = scriptUrl.origin;
              break;
            }
          }
        }
        
        if (!baseUrl) {
          const knownDomains = [
            "https://docusage.cz",
            "https://www.docusage.cz",
          ];
          baseUrl = knownDomains[0];
        }
        
        // First check whether the icon exists using a HEAD request
        const cacheBuster = Date.now();
        const iconUrl = `${baseUrl}/api/projects/${token}/bot-icon?v=${cacheBuster}`;
        
        // HEAD request to check whether the icon exists
        const headResponse = await fetch(iconUrl, {
          method: 'HEAD',
          cache: 'no-cache'
        });
        
        // If the icon does not exist, exit silently
        if (!headResponse.ok) {
          return;
        }
        
        // Now load the icon using GET
        const response = await fetch(iconUrl, {
          cache: 'no-cache'
        });
        
        if (response.ok) {
          const blob = await response.blob();
          const iconObjectUrl = URL.createObjectURL(blob);
          
          // Show the icon in the header
          const iconPlaceholder = document.querySelector(".docusage-bot-icon-placeholder");
          console.log("DocuSage Bot Icon Premium: Found placeholder:", iconPlaceholder);
          if (iconPlaceholder) {
            const iconImg = document.createElement("img");
            iconImg.src = iconObjectUrl;
            iconImg.alt = "Bot Icon";
            iconImg.style.width = "24px";
            iconImg.style.height = "24px";
            iconImg.style.borderRadius = "50%";
            iconImg.style.objectFit = "cover";
            
            iconPlaceholder.appendChild(iconImg);
            iconPlaceholder.style.display = "block";
          }
          
          // Function for adding the icon to messages
          window.docusageAddBotIconToMessages = () => {
            const messageIcons = document.querySelectorAll(".docusage-bot-message-icon");
            messageIcons.forEach(iconContainer => {
              if (!iconContainer.querySelector("img")) {
                const iconImg = document.createElement("img");
                iconImg.src = iconObjectUrl;
                iconImg.alt = "Bot Icon";
                iconImg.style.width = "100%";
                iconImg.style.height = "100%";
                iconImg.style.borderRadius = "50%";
                iconImg.style.objectFit = "cover";
                iconContainer.appendChild(iconImg);
              }
            });
          };
        }
      } catch (error) {
        // Silently ignore the error - the icon simply is not set
      }
    };

    // Loading the bot icon
    loadBotIcon();

    console.log("DocuSage Premium Chatbot initialized successfully");
  };

  // Initialize when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initPremiumChatBot);
  } else {
    initPremiumChatBot();
  }
})();
