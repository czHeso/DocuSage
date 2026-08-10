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

  // Create the CSS styles for the chatbot
  const createStyles = (primaryColor = "#2563eb", theme = "light") => {
    // Colours based on the theme
    const isDarkTheme = theme === "dark";
    const bgColor = isDarkTheme ? "#1f2937" : "#ffffff";
    const textColor = isDarkTheme ? "#f9fafb" : "#111827";
    const secondaryBgColor = isDarkTheme ? "#374151" : "#f3f4f6";

    return `
      .docusage-chat-widget {
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 9999;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
      }
      
      .docusage-chat-bubble {
        width: 68px;
        height: 68px;
        border-radius: 50%;
        background-color: ${primaryColor};
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
        transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
      }
      
      .docusage-chat-bubble:hover {
        transform: scale(1.1);
      }
      
      .docusage-chat-bubble:active {
        transform: scale(0.95);
      }
      
      .docusage-chat-icon {
        width: 30px;
        height: 30px;
        fill: white;
      }
      
      .docusage-notification-bubble {
        position: absolute;
        top: -85px;  /* Pushed even further up */
        right: 0;
        background-color: ${primaryColor};
        color: white;
        padding: 8px 12px;
        border-radius: 12px;
        box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
        font-size: 14px;
        max-width: 220px;
        opacity: 0;
        transform: translateY(10px);
        transition: opacity 0.3s ease, transform 0.3s ease;
        pointer-events: none;
        z-index: 10000;
        text-align: left;
        word-wrap: break-word;
        white-space: normal;
        line-height: 1.4;
      }
      
      .docusage-notification-bubble:after {
        content: '';
        position: absolute;
        bottom: -5px;
        right: 25px;
        width: 10px;
        height: 10px;
        background-color: ${primaryColor};
        transform: rotate(45deg);
      }
      
      .docusage-notification-bubble.active {
        opacity: 1;
        transform: translateY(0);
        animation: docusage-notification-pulse 2s infinite;
      }
      
      @keyframes docusage-notification-pulse {
        0% {
          box-shadow: 0 0 0 0 rgba(${
            primaryColor.startsWith("#")
              ? `${parseInt(primaryColor.slice(1, 3), 16)}, ${parseInt(primaryColor.slice(3, 5), 16)}, ${parseInt(primaryColor.slice(5, 7), 16)}`
              : "37, 99, 235"
          }, 0.4);
        }
        70% {
          box-shadow: 0 0 0 10px rgba(${
            primaryColor.startsWith("#")
              ? `${parseInt(primaryColor.slice(1, 3), 16)}, ${parseInt(primaryColor.slice(3, 5), 16)}, ${parseInt(primaryColor.slice(5, 7), 16)}`
              : "37, 99, 235"
          }, 0);
        }
        100% {
          box-shadow: 0 0 0 0 rgba(${
            primaryColor.startsWith("#")
              ? `${parseInt(primaryColor.slice(1, 3), 16)}, ${parseInt(primaryColor.slice(3, 5), 16)}, ${parseInt(primaryColor.slice(5, 7), 16)}`
              : "37, 99, 235"
          }, 0);
        }
      }
      
      .docusage-chat-container {
        display: none;
        position: absolute;
        bottom: 70px;
        right: 0;
        width: 350px;
        height: 500px;
        background-color: ${bgColor};
        border-radius: 12px;
        overflow: hidden;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
        flex-direction: column;
        border: 1px solid ${isDarkTheme ? "#374151" : "#e5e7eb"};
        transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        opacity: 0;
        transform: translateY(20px) scale(0.95);
      }
      
      .docusage-chat-container.active {
        display: flex;
        opacity: 1;
        transform: translateY(0) scale(1);
        animation: docusage-chat-open 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      }
      
      @keyframes docusage-chat-open {
        0% {
          opacity: 0;
          transform: translateY(20px) scale(0.95);
        }
        50% {
          opacity: 1;
          transform: translateY(-5px) scale(1.02);
        }
        100% {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }
      
      .docusage-chat-header {
        padding: 12px 16px;
        background-color: ${primaryColor};
        color: white;
        font-weight: 600;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      
      .docusage-chat-close {
        background: none;
        border: none;
        color: white;
        cursor: pointer;
        font-size: 18px;
        padding: 0;
        margin: 0;
      }
      
      .docusage-chat-messages {
        flex: 1;
        padding: 16px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      
      .docusage-message {
        max-width: 80%;
        padding: 12px;
        border-radius: 12px;
        position: relative;
        word-wrap: break-word;
      }
      
      .docusage-user-message {
        background-color: ${primaryColor};
        color: white;
        margin-left: auto;
        border-bottom-right-radius: 4px;
      }
      
      .docusage-bot-message {
        background-color: ${secondaryBgColor};
        color: ${textColor};
        margin-right: auto;
        border-bottom-left-radius: 4px;
      }
      
      .docusage-message-time {
        font-size: 10px;
        margin-top: 4px;
        opacity: 0.7;
      }
      
      .docusage-chat-input-container {
        padding: 12px;
        border-top: 1px solid ${isDarkTheme ? "#374151" : "#e5e7eb"};
        display: flex;
        gap: 8px;
      }
      
      .docusage-chat-input {
        flex: 1;
        padding: 10px 12px;
        border-radius: 18px;
        border: 1px solid ${isDarkTheme ? "#4b5563" : "#d1d5db"};
        background-color: ${isDarkTheme ? "#374151" : "#f9fafb"};
        color: ${textColor};
        outline: none;
        resize: none;
        font-family: inherit;
        font-size: 14px;
        min-height: 24px;
        max-height: 120px;
        overflow-y: auto;
      }
      
      .docusage-chat-input:focus {
        border-color: ${primaryColor};
      }
      
      .docusage-send-button {
        background-color: ${primaryColor};
        color: white;
        border: none;
        width: 36px;
        height: 36px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        flex-shrink: 0;
        align-self: flex-end;
        transition: opacity 0.2s;
      }
      
      .docusage-send-button:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
      
      .docusage-disclaimer {
        font-size: 10px;
        color: ${isDarkTheme ? "#9ca3af" : "#6b7280"};
        text-align: center;
        padding: 4px 12px;
        margin-top: 2px;
        line-height: 1.2;
      }
      
      .docusage-typing-indicator {
        display: flex;
        flex-direction: column;
        padding: 12px;
        background-color: ${secondaryBgColor};
        border-radius: 12px;
        width: fit-content;
        margin-right: auto;
        border-bottom-left-radius: 4px;
      }
      
      .docusage-dots-container {
        display: flex;
        align-items: center;
        margin-bottom: 6px;
      }
      
      .docusage-typing-indicator span {
        width: 8px;
        height: 8px;
        background-color: ${primaryColor};
        border-radius: 50%;
        display: inline-block;
        margin: 0 3px;
        animation: docusage-typing 1.4s infinite ease-in-out;
      }
      
      .docusage-typing-text {
        font-size: 12px;
        color: ${isDarkTheme ? "#9ca3af" : "#6b7280"};
        animation: docusage-pulse 2s infinite ease-in-out;
      }
      
      .docusage-typing-indicator span:nth-child(1) {
        animation-delay: 0s;
      }
      
      .docusage-typing-indicator span:nth-child(2) {
        animation-delay: 0.2s;
      }
      
      .docusage-typing-indicator span:nth-child(3) {
        animation-delay: 0.4s;
      }
      
      @keyframes docusage-typing {
        0%, 60%, 100% {
          transform: translateY(0);
          opacity: 0.4;
        }
        30% {
          transform: translateY(-6px);
          opacity: 1;
        }
      }
      
      @keyframes docusage-pulse {
        0% {
          opacity: 0.7;
        }
        50% {
          opacity: 1;
        }
      }

      /* Multi-modal styles for code */
      .docusage-code-block {
        background: ${isDarkTheme ? "#1f2937" : "#f8fafc"};
        border: 1px solid ${isDarkTheme ? "#374151" : "#e5e7eb"};
        border-radius: 8px;
        margin: 8px 0;
        overflow-x: auto;
      }

      .docusage-code-block pre {
        margin: 0;
        padding: 12px;
        white-space: pre-wrap;
        word-wrap: break-word;
      }

      .docusage-code-block code {
        font-family: 'Monaco', 'Consolas', 'Courier New', monospace;
        font-size: 13px;
        line-height: 1.4;
        color: ${isDarkTheme ? "#f9fafb" : "#1f2937"};
      }

      .docusage-inline-code {
        background: ${isDarkTheme ? "#374151" : "#f3f4f6"};
        color: ${isDarkTheme ? "#f9fafb" : "#1f2937"};
        padding: 2px 6px;
        border-radius: 4px;
        font-family: 'Monaco', 'Consolas', 'Courier New', monospace;
        font-size: 13px;
      }

      /* Multi-modal styles for tables */
      .docusage-table-container {
        margin: 8px 0;
        overflow-x: auto;
        border-radius: 8px;
        border: 1px solid ${isDarkTheme ? "#374151" : "#e5e7eb"};
      }

      .docusage-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 14px;
      }

      .docusage-table th {
        background: ${isDarkTheme ? "#374151" : "#f8fafc"};
        color: ${isDarkTheme ? "#f9fafb" : "#374151"};
        padding: 8px 12px;
        text-align: left;
        font-weight: 600;
        border-bottom: 2px solid ${isDarkTheme ? "#4b5563" : "#d1d5db"};
      }

      .docusage-table td {
        padding: 8px 12px;
        border-bottom: 1px solid ${isDarkTheme ? "#374151" : "#e5e7eb"};
        color: ${textColor};
      }

      .docusage-table tr:hover td {
        background: ${isDarkTheme ? "#1f2937" : "#f9fafb"};
      }

      /* Styly pro odkazy */
      .docusage-link-buttons {
        margin-top: 8px;
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }

      .docusage-link-button:hover {
        transform: translateY(-1px) !important;
        box-shadow: 0 4px 8px rgba(0,0,0,0.15) !important;
      }
        100% {
          opacity: 0.7;
        }
      }
      
      /* Rating styles */
      .docusage-rating-overlay {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: ${bgColor};
        z-index: 1000;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 20px;
        text-align: center;
        border-radius: inherit;
      }
      
      .docusage-rating-title {
        color: ${textColor};
        font-size: 16px;
        font-weight: 600;
        margin-bottom: 20px;
        line-height: 1.4;
      }
      
      .docusage-rating-stars {
        display: flex;
        gap: 8px;
        margin-bottom: 20px;
      }
      
      .docusage-rating-star {
        width: 32px;
        height: 32px;
        cursor: pointer;
        color: #d1d5db;
        transition: all 0.2s ease;
      }
      
      .docusage-rating-star:hover,
      .docusage-rating-star.active {
        color: #fbbf24;
      }
      
      .docusage-rating-star svg {
        width: 100%;
        height: 100%;
        fill: currentColor;
      }
      
      .docusage-rating-thank-you {
        color: ${textColor};
        font-size: 16px;
        font-weight: 500;
        text-align: center;
        animation: docusage-fadeIn 0.3s ease;
      }
      
      @keyframes docusage-fadeIn {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
      }

      /* Multi-modal styles for the classic embed */
      .docusage-code-block {
        background: ${isDarkTheme ? "#1f2937" : "#f8fafc"};
        border: 1px solid ${isDarkTheme ? "#374151" : "#e5e7eb"};
        border-radius: 8px;
        margin: 8px 0;
        overflow-x: auto;
      }

      .docusage-code-block pre {
        margin: 0;
        padding: 12px;
        white-space: pre-wrap;
        word-wrap: break-word;
      }

      .docusage-code-block code {
        font-family: 'Monaco', 'Consolas', 'Courier New', monospace;
        font-size: 13px;
        line-height: 1.4;
        color: ${isDarkTheme ? "#f9fafb" : "#1f2937"};
      }

      .docusage-inline-code {
        background: ${isDarkTheme ? "#374151" : "#f3f4f6"};
        color: ${isDarkTheme ? "#f9fafb" : "#1f2937"};
        padding: 2px 6px;
        border-radius: 4px;
        font-family: 'Monaco', 'Consolas', 'Courier New', monospace;
        font-size: 13px;
      }

      .docusage-table-container {
        margin: 8px 0;
        overflow-x: auto;
        border-radius: 8px;
        border: 1px solid ${isDarkTheme ? "#374151" : "#e5e7eb"};
      }

      .docusage-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 14px;
      }

      .docusage-table th {
        background: ${isDarkTheme ? "#374151" : "#f8fafc"};
        color: ${isDarkTheme ? "#f9fafb" : "#374151"};
        padding: 8px 12px;
        text-align: left;
        font-weight: 600;
        border-bottom: 2px solid ${isDarkTheme ? "#4b5563" : "#d1d5db"};
      }

      .docusage-table td {
        padding: 8px 12px;
        border-bottom: 1px solid ${isDarkTheme ? "#374151" : "#e5e7eb"};
        color: ${textColor};
      }

      .docusage-table tr:hover td {
        background: ${isDarkTheme ? "#1f2937" : "#f9fafb"};
      }

      .docusage-link-buttons {
        margin-top: 8px;
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }

      .docusage-link-button:hover {
        transform: translateY(-1px) !important;
        box-shadow: 0 4px 8px rgba(0,0,0,0.15) !important;
      }
    `;
  };

  // Create the HTML elements
  const createWidgetHTML = (chatbotName, disclaimerText, hidePoweredBy) => {
    const widget = document.createElement("div");
    widget.className = "docusage-chat-widget";

    // Chat bubble (button)
    const bubble = document.createElement("div");
    bubble.className = "docusage-chat-bubble";

    const bubbleIcon = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "svg",
    );
    bubbleIcon.setAttribute("class", "docusage-chat-icon");
    bubbleIcon.setAttribute("viewBox", "0 0 24 24");
    bubbleIcon.innerHTML = `<path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z"/><path d="M7 9h10v2H7z"/><path d="M7 5h10v2H7z"/><path d="M7 13h7v2H7z"/>`;

    bubble.appendChild(bubbleIcon);

    // Notification bubble
    const notificationBubble = document.createElement("div");
    notificationBubble.className = "docusage-notification-bubble";
    notificationBubble.style.display = "none"; // Starts hidden

    bubble.appendChild(notificationBubble);

    // Chat container
    const container = document.createElement("div");
    container.className = "docusage-chat-container";

    // Header
    const header = document.createElement("div");
    header.className = "docusage-chat-header";
    
    // Create a flex container for the icon and the name
    const headerContent = document.createElement("div");
    headerContent.style.display = "flex";
    headerContent.style.alignItems = "center";
    headerContent.style.gap = "8px";
    
    // Placeholder for the bot icon (added later if it exists)
    const botIconPlaceholder = document.createElement("div");
    botIconPlaceholder.className = "docusage-bot-icon-placeholder";
    botIconPlaceholder.style.display = "none";
    
    const chatbotNameElement = document.createElement("div");
    chatbotNameElement.textContent = chatbotName || "DocuSage Asistent";
    
    const closeButton = document.createElement("button");
    closeButton.className = "docusage-chat-close";
    closeButton.innerHTML = "&times;";
    
    headerContent.appendChild(botIconPlaceholder);
    headerContent.appendChild(chatbotNameElement);
    
    header.appendChild(headerContent);
    header.appendChild(closeButton);

    // Messages area
    const messages = document.createElement("div");
    messages.className = "docusage-chat-messages";

    // Input container
    const inputContainer = document.createElement("div");
    inputContainer.className = "docusage-chat-input-container";

    const input = document.createElement("textarea");
    input.className = "docusage-chat-input";
    input.placeholder = "Type a message...";
    input.rows = 1;

    const sendButton = document.createElement("button");
    sendButton.className = "docusage-send-button";
    sendButton.disabled = true;
    sendButton.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M22 2L11 13" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;

    inputContainer.appendChild(input);
    inputContainer.appendChild(sendButton);

    // Disclaimer
    const disclaimer = document.createElement("div");
    disclaimer.className = "docusage-disclaimer";
    disclaimer.innerHTML =
      escapeHtml(disclaimerText) + (hidePoweredBy ? "" : " | Powered by DocuSage");

    // Assemble
    container.appendChild(header);
    container.appendChild(messages);
    container.appendChild(inputContainer);
    container.appendChild(disclaimer);

    widget.appendChild(container);
    widget.appendChild(bubble);

    return { widget, bubble, container, header, messages, input, sendButton };
  };

  // Inicializace chatbotu
  const initChatBot = () => {
    // Read all parameters from the script attributes
    const script =
      document.currentScript || document.querySelector("script[data-token]");
    
    if (!script) {
      console.error("DocuSage Chatbot: could not find a script element with a data-token attribute.");
      return;
    }
    const token = script.getAttribute("data-token");
    const color = script.getAttribute("data-color") || "blue";
    const theme = script.getAttribute("data-theme") || "light";
    const chatbotName =
      script.getAttribute("data-chatbot-name") || "DocuSage Asistent";
    const welcomeMessage =
      script.getAttribute("data-welcome-message") ||
      "Hi, feel free to ask a question here";
    const disclaimerText =
      script.getAttribute("data-disclaimer-text") ||
      "Answers are generated by AI and may not always be accurate";

    // Parameters for notifications
    const notificationEnabled =
      script.getAttribute("data-notification-enabled") === "true";
    const notificationDelay = parseInt(
      script.getAttribute("data-notification-delay") || "15",
      10,
    );
    const notificationText =
      script.getAttribute("data-notification-text") ||
      "Need help with anything?";
    
    // Parameters for the rating system
    const ratingEnabled = script.getAttribute("data-rating-enabled") !== "false"; // Default: enabled
    const ratingPromptMessage = script.getAttribute("data-rating-prompt-message") || "Please rate our conversation";
    const ratingThankYouMessage = script.getAttribute("data-rating-thank-you-message") || "Thank you for your rating!";

    if (!token) {
      console.error(
        "DocuSage Chatbot: missing project token. Add the data-token attribute to the script.",
      );
      return;
    }

    // Mapping of colour names to hex codes
    const colorMap = {
      blue: "#2563eb",
      green: "#10b981",
      red: "#ef4444",
      purple: "#8b5cf6",
      orange: "#f97316",
      // Additional colour variants
      teal: "#14b8a6",
      indigo: "#6366f1",
      yellow: "#eab308",
      pink: "#ec4899",
      gray: "#71717a",
    };

    // Use the colour from the attribute or the default blue
    // Hex colour codes are also accepted directly as input
    const primaryColor = color.startsWith("#")
      ? color
      : colorMap[color] || colorMap.blue;

    // Create the styles
    const styleElement = document.createElement("style");
    styleElement.textContent = createStyles(primaryColor, theme);
    document.head.appendChild(styleElement);

    // Read the hidePoweredBy parameter
    const hidePoweredBy = script.getAttribute("data-hide-powered-by") === "true";
    
    // Create the HTML elements using the custom chatbot name
    const elements = createWidgetHTML(chatbotName, disclaimerText, hidePoweredBy);
    document.body.appendChild(elements.widget);

    // State
    let isOpen = false;
    let sessionId = null;
    let isLoading = false;
    let notificationVisible = false;
    let notificationTimer = null;
    let hasRated = false;

    // Analytics state
    let chatOpenTime = 0; // Used to track the interaction duration
    let hasInteracted = false; // Used to track whether the user asked a question

    // ID used to track the visitor
    let visitorId =
      localStorage.getItem("docusage_visitor_id") || crypto.randomUUID();
    // Store the ID in localStorage for persistence
    localStorage.setItem("docusage_visitor_id", visitorId);
    // ID relace
    let chatSessionId = crypto.randomUUID();

    // Find the notification bubble and set its text
    const notificationBubble = elements.bubble.querySelector(
      ".docusage-notification-bubble",
    );
    if (notificationBubble) {
      notificationBubble.textContent = notificationText;
    }
    
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
            if (script.src && script.src.includes("embed.js")) {
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
          console.log("DocuSage Bot Icon: Found placeholder:", iconPlaceholder);
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
              if (iconContainer.children.length === 0) {
                const messageIconImg = document.createElement("img");
                messageIconImg.src = iconObjectUrl;
                messageIconImg.alt = "Bot Icon";
                messageIconImg.style.width = "20px";
                messageIconImg.style.height = "20px";
                messageIconImg.style.borderRadius = "50%";
                messageIconImg.style.objectFit = "cover";
                
                iconContainer.appendChild(messageIconImg);
                iconContainer.style.display = "block";
              }
            });
          };
          
          // Add icons to the existing messages
          window.docusageAddBotIconToMessages();
        }
      } catch (error) {
        // Silently ignore the error - the icon simply is not set
      }
    };
    
    // Loading the bot icon
    loadBotIcon();

    // Function for showing the notification bubble
    const showNotification = () => {
      if (isOpen || notificationVisible) return; // Do not show it if the chat is already open

      if (notificationBubble) {
        notificationBubble.style.display = "block";
        setTimeout(() => {
          notificationBubble.classList.add("active");
          notificationVisible = true;
        }, 10); // Short delay so the animation can apply
      }
    };

    // Function for hiding the notification bubble
    const hideNotification = () => {
      if (notificationBubble) {
        notificationBubble.classList.remove("active");
        notificationVisible = false;

        // Hide once the animation finishes
        setTimeout(() => {
          notificationBubble.style.display = "none";
        }, 300);
      }
    };

    // Device type detection
    const detectDeviceType = () => {
      const userAgent = navigator.userAgent || navigator.vendor || window.opera;

      // Mobile device detection
      if (
        /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(
          userAgent,
        )
      ) {
        if (/tablet|ipad/i.test(userAgent)) {
          return "tablet";
        }
        return "mobile";
      }

      // Detection of other device types
      if (/macintosh|mac os x/i.test(userAgent)) {
        return "mac";
      }

      if (/windows|win32|win64/i.test(userAgent)) {
        return "windows";
      }

      if (/linux/i.test(userAgent)) {
        return "linux";
      }

      return "desktop"; // Default value
    };

    // Function for sending analytics data
    const sendAnalytics = async (action) => {
      try {
        // Determine the script URL in order to build the analytics endpoint
        let apiUrl;
        let baseUrl = null;

        // First try to find the script by its data-token attribute
        const tokenScript = document.querySelector("script[data-token]");
        if (tokenScript && tokenScript.src) {
          const scriptUrl = new URL(tokenScript.src);
          baseUrl = scriptUrl.origin;
        }

        // If that does not work, try to find the current script
        if (!baseUrl && document.currentScript && document.currentScript.src) {
          const scriptUrl = new URL(document.currentScript.src);
          baseUrl = scriptUrl.origin;
        }

        // Third attempt - look for all scripts with embed.js in the URL
        if (!baseUrl) {
          const allScripts = Array.from(document.querySelectorAll("script"));
          for (const script of allScripts) {
            if (script.src && script.src.includes("embed.js")) {
              const scriptUrl = new URL(script.src);
              baseUrl = scriptUrl.origin;
              break;
            }
          }
        }

        // If the base URL cannot be detected, use the explicit list of known domains
        if (!baseUrl) {
          const knownDomains = [
            "https://docusage.cz",
            "https://www.docusage.cz",
          ];

          // Pick the first domain as the default (production)
          baseUrl = knownDomains[0];
        }

        // Build the API URL - add a timestamp to prevent caching
        // Use the token directly as the project identifier for analytics
        apiUrl = new URL(
          `/api/projects/${token}/chatbot-analytics?t=${Date.now()}`,
          baseUrl,
        );

        // Build the payload to send
        const analyticsData = {
          action, // 'open', 'query', nebo 'close'
          pageUrl: window.location.href,
          referrer: document.referrer,
          visitorId,
          sessionId: chatSessionId,
          userAgent: navigator.userAgent,
          deviceType: detectDeviceType(),
          duration:
            action === "close"
              ? Math.floor((Date.now() - chatOpenTime) / 1000)
              : undefined,
        };

        // Retry implementation for better reliability, with exponential backoff and improved logging
        const sendWithRetry = async (url, data, maxRetries = 5) => {
          let attempt = 0;
          let success = false;
          const analyticsId = crypto.randomUUID().substring(0, 8); // Unique ID identifying the transaction in the log

          // For the 'close' action try sendBeacon, which is more reliable while the window closes
          // Important: sendBeacon is asynchronous and does not guarantee delivery, so it is not ideal for measurement
          // Keep it only as a backup when closing the window; other actions rely on fetch
          if (action === "close" && navigator.sendBeacon) {
            try {
              const blob = new Blob([JSON.stringify(data)], {
                type: "application/json",
              });
              success = navigator.sendBeacon(url, blob);

              if (success) {
                return true;
              } else {
                console.warn(
                  `DocuSage Analytics [${analyticsId}]: sendBeacon failed, falling back to fetch`,
                );
              }
            } catch (beaconError) {
              console.warn(
                `DocuSage Analytics [${analyticsId}]: sendBeacon selhal s chybou:`,
                beaconError,
              );
            }
          }

          // For other actions, or if sendBeacon failed, try fetch with exponential backoff
          // Exponential backoff improves the chance of success during transient network issues
          while (attempt < maxRetries && !success) {
            try {
              // Add a timestamp to the URL to prevent caching
              const timestampedUrl = url.includes("?")
                ? `${url}&_t=${Date.now()}`
                : `${url}?_t=${Date.now()}`;

              const response = await fetch(timestampedUrl, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "X-Analytics-ID": analyticsId,
                  "Cache-Control": "no-cache, no-store, must-revalidate",
                },
                body: JSON.stringify(data),
                keepalive: true, // Important for sending while the page is closing
                cache: "no-store", // Explicitly disable caching
              });

              if (response.ok) {
                success = true;

                // Try to read and log the response for debugging
                try {
                  const responseData = await response.json();
                } catch (jsonError) {
                  // Ignore response parsing errors; what matters is that the data was sent
                }

                break;
              } else {
                console.warn(`DocuSage Analytics [${analyticsId}]: Pokus ${attempt + 1}/${maxRetries} selhal, 
                  status ${response.status}`);
              }
            } catch (err) {
              console.warn(
                `DocuSage Analytics [${analyticsId}]: Pokus ${attempt + 1}/${maxRetries} selhal s chybou:`,
                err,
              );
            }

            attempt++;

            // With repeated attempts, add exponential backoff
            if (attempt < maxRetries) {
              const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000); // Max 10 sekund
              await new Promise((r) => setTimeout(r, delay));
            }
          }

          if (success) {
          } else {
            console.error(`DocuSage Analytics: all attempts failed`);
          }

          return success;
        };

        // Start sending with retries
        try {
          await sendWithRetry(apiUrl.toString(), analyticsData);
        } catch (error) {
          console.error(
            "DocuSage Analytics: final failure sending analytics:",
            error,
          );
        }
      } catch (error) {
        // Silent failure - we do not want to disrupt the chat
        console.error("DocuSage Chatbot: Error sending analytics:", error);
      }
    };

    // Add the bot's first message using the custom welcome text
    const addWelcomeMessage = () => {
      addBotMessage(welcomeMessage);
    };

    // Initialise with the chat closed
    // The chat only appears after clicking the bubble
    isOpen = false;
    elements.container.classList.remove("active");


    


    // Show/hide the chat
    const toggleChat = () => {
      isOpen = !isOpen;
      if (isOpen) {
        elements.container.classList.add("active");
        // Add the welcome message if the container is empty
        if (elements.messages.children.length === 0) {
          addWelcomeMessage();
        }
        setTimeout(() => elements.input.focus(), 300); // Wait for the animation to finish

        // Record the chat opening for analytics
        chatOpenTime = Date.now();
        try {
          // For the "open" action, make sure the analytics data is sent and the response awaited
          (async () => {
            await sendAnalytics("open");
          })();
        } catch (err) {}
      } else {
        // Check if rating is enabled and we have messages
        if (ratingEnabled && sessionId && elements.messages.children.length > 1) {
          showRatingOverlay();
        } else {
          elements.container.classList.remove("active");
        }

        // Record the chat closing for analytics
        if (chatOpenTime > 0) {
          try {
            // For the "close" action we prefer sendBeacon (implemented in sendAnalytics)
            sendAnalytics("close");
          } catch (err) {
            console.warn(
              "DocuSage Analytics: error recording the chat close",
              err,
            );
          }
        }
      }
    };

    // Show the typing indicator with animated text
    const showTypingIndicator = () => {
      const indicator = document.createElement("div");
      indicator.className = "docusage-typing-indicator";

      // Create the HTML structure with dots and text
      indicator.innerHTML = `
        <div class="docusage-dots-container">
          <span></span>
          <span></span>
          <span></span>
        </div>
        <div class="docusage-typing-text">The AI is thinking...</div>
      `;

      // Add the animation that changes the indicator text
      const typingTexts = [
        "The AI is thinking...",
        "Processing the question...",
        "Looking for an answer...",
        "Generuji text...",
      ];
      let textIndex = 0;

      // Interval that changes the text every 2 seconds
      const textInterval = setInterval(() => {
        textIndex = (textIndex + 1) % typingTexts.length;
        const textElement = indicator.querySelector(".docusage-typing-text");
        if (textElement) {
          textElement.textContent = typingTexts[textIndex];
        }
      }, 2000);

      // Attach the interval to the indicator so it can be cleared later
      indicator.textInterval = textInterval;

      elements.messages.appendChild(indicator);
      scrollToBottom();
      return indicator;
    };

    // Automatically scroll to the bottom of the chat
    const scrollToBottom = () => {
      elements.messages.scrollTop = elements.messages.scrollHeight;
    };

    // Add the user's message to the chat
    const addUserMessage = (text) => {
      const userMessage = document.createElement("div");
      userMessage.className = "docusage-message docusage-user-message";
      userMessage.innerHTML = `
        <div>${escapeHtml(text)}</div>
        <div class="docusage-message-time">${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
      `;
      elements.messages.appendChild(userMessage);
      scrollToBottom();
    };

    // Multi-modal content formatting function
    const formatMultiModalContent = (text) => {
      // Escape the HTML first, only then apply markdown formatting,
      // so the content cannot turn into executable code.
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
      formattedText = formattedText.replace(/```([\s\S]*?)```/g, '<div class="docusage-code-block"><pre><code>$1</code></pre></div>');
      formattedText = formattedText.replace(/`([^`]+)`/g, '<code class="docusage-inline-code">$1</code>');

      // Detect tables (markdown style)
      const tableRegex = /(\|[^|\n]*\|[^|\n]*\|[\s\S]*?)(?=\n\n|\n$|$)/g;
      formattedText = formattedText.replace(tableRegex, (match) => {
        const rows = match.trim().split('\n');
        if (rows.length < 2) return match;
        
        let tableHTML = '<div class="docusage-table-container"><table class="docusage-table">';
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

      // Put the links back as placeholders for later processing
      urls.forEach((url, index) => {
        formattedText = formattedText.replace(`__URL_${index}__`, `__URL_${index}__`);
      });

      return { formattedText, urls };
    };

    // Add the bot's answer to the chat with multi-modal support
    const addBotMessage = (text) => {
      const { formattedText, urls } = formatMultiModalContent(text);
      
      const messageContainer = document.createElement("div");
      messageContainer.style.display = "flex";
      messageContainer.style.alignItems = "flex-start";
      messageContainer.style.gap = "8px";
      messageContainer.style.marginBottom = "12px";
      
      // Create a placeholder for the bot icon
      const botIconContainer = document.createElement("div");
      botIconContainer.className = "docusage-bot-message-icon";
      botIconContainer.style.display = "none";
      botIconContainer.style.flexShrink = "0";
      botIconContainer.style.marginTop = "4px";
      
      const botMessage = document.createElement("div");
      botMessage.className = "docusage-message docusage-bot-message";
      
      let finalText = formattedText;
      // Replace the URL placeholders back
      urls.forEach((url, index) => {
        finalText = finalText.replace(`__URL_${index}__`, url);
      });
      
      botMessage.innerHTML = `
        <div>${finalText}</div>
        <div class="docusage-message-time">${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
      `;
      
      // Add the link buttons
      if (urls.length > 0) {
        const linkContainer = document.createElement("div");
        linkContainer.className = "docusage-link-buttons";
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
          linkButton.className = "docusage-link-button";
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
        
        botMessage.appendChild(linkContainer);
      }
      
      messageContainer.appendChild(botIconContainer);
      messageContainer.appendChild(botMessage);
      elements.messages.appendChild(messageContainer);
      
      // Add the icon if it is available
      if (window.docusageAddBotIconToMessages) {
        window.docusageAddBotIconToMessages();
      }
      
      scrollToBottom();
    };

    // Send the message to the server
    const sendMessage = async (message) => {
      if (isLoading || !message.trim()) return;

      // Add the user's message to the chat
      addUserMessage(message);

      // Record that the user asked a question, for analytics
      hasInteracted = true;
      try {
        // For the "query" action, make sure the analytics data is sent and the response awaited
        (async () => {
          await sendAnalytics("query");
        })();
      } catch (err) {
        console.warn("DocuSage Analytics: error recording the question", err);
      }

      // Show the typing indicator
      isLoading = true;
      elements.sendButton.disabled = true;
      const indicator = showTypingIndicator();

      try {
        // API URL - resolve the correct URL for API calls (must be on the same domain as the script)
        // 1. Try to obtain the script URL in several ways
        let scriptSrc = null;

        // If document.currentScript is available (modern browsers)
        if (document.currentScript && document.currentScript.src) {
          scriptSrc = document.currentScript.src;
        }

        // Second attempt - find the script by its data-token attribute
        if (!scriptSrc) {
          const tokenScript = document.querySelector("script[data-token]");
          if (tokenScript && tokenScript.src) {
            scriptSrc = tokenScript.src;
          }
        }

        // Third attempt - look for all scripts with embed.js in the URL
        if (!scriptSrc) {
          const allScripts = Array.from(document.querySelectorAll("script"));
          const embedScript = allScripts.find(
            (script) => script.src && script.src.includes("embed.js"),
          );
          if (embedScript && embedScript.src) {
            scriptSrc = embedScript.src;
          }
        }

        // Last attempt - load any script from our domain
        if (!scriptSrc) {
          // Heuristic - try to find at least some script from our domain by name
          const domainHints = ["docusage", "chatbot", "skibidi", "ai-hub"];
          const allScripts = Array.from(document.querySelectorAll("script"));

          const matchingScript = allScripts.find((script) => {
            if (!script.src) return false;
            const src = script.src.toLowerCase();
            return domainHints.some((hint) => src.includes(hint.toLowerCase()));
          });

          if (matchingScript && matchingScript.src) {
            scriptSrc = matchingScript.src;
          }
        }

        let apiUrl;

        if (scriptSrc) {
          // Extract the base URL from the script source
          try {
            const scriptUrl = new URL(scriptSrc);

            // Build the API URL
            apiUrl = new URL("/api/chat-embed", scriptUrl.origin);

            // Extra check - if the domains match there will be no CORS problems
            if (scriptUrl.origin === window.location.origin) {
              console.log(
                "DocuSage Chatbot: script and site are on the same domain - CORS should not be an issue",
              );
            } else {
              console.log(
                "DocuSage Chatbot: script and site are on different domains - CORS may be required",
              );
            }
          } catch (urlError) {
            console.error(
              "DocuSage Chatbot: error parsing the script URL:",
              urlError,
            );

            // Always try the current domain first - that is the most reliable approach
            // If the site operator embedded our script, the API endpoint should also be available
            apiUrl = new URL("/api/chat-embed", window.location.origin);
            console.warn(
              "DocuSage Chatbot: using the standard API URL:",
              apiUrl.toString(),
            );
          }
        } else {
          // The script could not be detected, use the dynamic fallback
          console.warn(
            "DocuSage Chatbot: could not determine the script URL, using the fallback.",
          );

          // Always try the current domain first - that is the most reliable approach
          // If the site operator embedded our script, the API endpoint should also be available
          apiUrl = new URL("/api/chat-embed", window.location.origin);
          console.warn(
            "DocuSage Chatbot: using the standard API URL:",
            apiUrl.toString(),
          );
        }

        // Prepare the request with better CORS support

        // Header optimisation for CORS - using standard headers
        const headers = new Headers({
          "Content-Type": "application/json",
          Accept: "application/json",
        });

        // Create the JSON payload
        const payload = JSON.stringify({
          message,
          token,
          sessionId,
        });

        console.log(
          "DocuSage Chatbot: Sending request with payload length:",
          payload.length,
        );

        // Send the request with maximum CORS compatibility
        const response = await fetch(apiUrl.toString(), {
          method: "POST",
          headers: headers,
          mode: "cors",
          cache: "no-cache",
          credentials: "omit", // We do not send cookies because this is a cross-origin request
          redirect: "follow",
          referrerPolicy: "no-referrer",
          body: payload,
        });

        if (!response.ok) {
          console.error("The API response was not OK:", await response.text());
          throw new Error(
            `Network response was not ok: ${response.status} ${response.statusText}`,
          );
        }

        const data = await response.json();

        // Set the session ID
        if (data.sessionId && !sessionId) {
          sessionId = data.sessionId;
        }

        // Remove the typing indicator and clear the interval
        if (indicator) {
          if (indicator.textInterval) {
            clearInterval(indicator.textInterval);
          }
          if (indicator.parentNode) {
            indicator.parentNode.removeChild(indicator);
          }
        }

        // Add the bot's answer
        addBotMessage(data.message.content);
      } catch (error) {
        console.error("DocuSage Chatbot Error:", error);
        // Add more detailed information for debugging
        if (error.message) {
          console.error("Error message:", error.message);
        }
        if (error.stack) {
          console.error("Error stack:", error.stack);
        }

        // Remove the typing indicator and clear the interval
        if (indicator) {
          if (indicator.textInterval) {
            clearInterval(indicator.textInterval);
          }
          if (indicator.parentNode) {
            indicator.parentNode.removeChild(indicator);
          }
        }

        // Add the error message
        addBotMessage(
          `Sorry, we could not process your message. Please try again. Error: ${error.message || "Failed to fetch"}`,
        );

        // Log more detailed information for debugging
        console.error("DocuSage Chatbot Error details:", {
          error_message: error.message,
          error_name: error.name,
          api_url: apiUrl ? apiUrl.toString() : "unknown",
          // Add token information for easier diagnostics
          token_available: embedToken ? "yes" : "no",
        });

        // Add more detailed CORS information for developers
        if (error.message && error.message.includes("CORS")) {
          console.warn(
            "DocuSage Chatbot: CORS error - make sure CORS is configured correctly on the server and the request carries an Origin header.",
          );
          console.warn("DocuSage Chatbot: CORS error - more details:", {
            origin: window.location.origin,
            url: apiUrl ? apiUrl.toString() : "unknown",
            mode: "cors",
          });
        }

        // Use a custom test fetch so we can see the error message
        try {
          // Get the payload we attempted to send
          const debugPayload = {
            message: message || "undefined",
            sessionId: chatSessionId || "undefined",
            token: embedToken || "undefined",
          };

          // Try an OPTIONS request manually to see what the server returns
          console.warn(
            "DocuSage Chatbot: trying an OPTIONS request against the endpoint...",
          );
          console.warn(
            "DocuSage Chatbot: Payload pro debugging:",
            debugPayload,
          );

          fetch(apiUrl.toString(), {
            method: "OPTIONS",
            mode: "cors",
            headers: {
              "Content-Type": "application/json",
            },
          })
            .then((r) => {
              console.log(
                "DocuSage Chatbot: OPTIONS response:",
                r.status,
                r.statusText,
              );
              console.log("DocuSage Chatbot: Response headers:", {
                "access-control-allow-origin": r.headers.get(
                  "access-control-allow-origin",
                ),
                "access-control-allow-methods": r.headers.get(
                  "access-control-allow-methods",
                ),
                "access-control-allow-headers": r.headers.get(
                  "access-control-allow-headers",
                ),
              });
              r.text().then((t) =>
                console.log("DocuSage Chatbot: OPTIONS body:", t),
              );
            })
            .catch((e) => {
              console.error("DocuSage Chatbot: OPTIONS error:", e.message);
            });
        } catch (testError) {
          console.error("DocuSage Chatbot: Test fetch error:", testError);
        }
      } finally {
        isLoading = false;
        elements.input.value = "";
        elements.sendButton.disabled = !elements.input.value.trim();
      }
    };

    // Event for sending a message
    const handleSend = () => {
      const message = elements.input.value.trim();
      if (message) {
        sendMessage(message);
      }
    };

    // Set the timer for showing the notification
    if (notificationEnabled && notificationDelay > 0) {
      // Clear the previous timer if there is one
      if (notificationTimer) {
        clearTimeout(notificationTimer);
      }

      // Set a new timer
      notificationTimer = setTimeout(() => {
        showNotification();
      }, notificationDelay * 1000); // convert to milliseconds

      console.log(
        `DocuSage Chatbot: Notifikace bude zobrazena za ${notificationDelay} sekund`,
      );
    }

    // Event listeners
    elements.bubble.addEventListener("click", () => {
      toggleChat();
      hideNotification(); // Hide the notification when the chat opens
    });

    // Rating system functions for classic embed
    const showRatingOverlay = () => {
      const overlay = document.createElement('div');
      overlay.className = 'docusage-rating-overlay';
      
      overlay.innerHTML = `
        <style>
          .docusage-rating-overlay {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(255, 255, 255, 0.95);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            border-radius: 12px;
          }
          .docusage-rating-title {
            font-size: 16px;
            font-weight: 500;
            color: #333;
            margin-bottom: 20px;
            text-align: center;
          }
          .docusage-rating-stars {
            display: flex;
            gap: 8px;
            margin-bottom: 20px;
          }
          .docusage-rating-star {
            width: 32px;
            height: 32px;
            cursor: pointer;
            color: #ddd;
            transition: color 0.2s;
          }
          .docusage-rating-star:hover,
          .docusage-rating-star.active {
            color: #ffd700;
          }
          .docusage-rating-star svg {
            width: 100%;
            height: 100%;
            fill: currentColor;
          }
        </style>
        <div class="docusage-rating-title">${ratingPromptMessage}</div>
        <div class="docusage-rating-stars">
          ${[1, 2, 3, 4, 5].map(num => `
            <div class="docusage-rating-star" data-rating="${num}">
              <svg viewBox="0 0 24 24">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
              </svg>
            </div>
          `).join('')}
        </div>
      `;
      
      elements.container.appendChild(overlay);
      
      // Handle star clicks
      overlay.querySelectorAll('.docusage-rating-star').forEach(star => {
        star.addEventListener('click', (e) => {
          const rating = parseInt(e.currentTarget.dataset.rating);
          submitRating(rating);
          showThankYouMessage(overlay);
        });
        
        star.addEventListener('mouseenter', (e) => {
          const rating = parseInt(e.currentTarget.dataset.rating);
          highlightStars(overlay, rating);
        });
      });
      
      overlay.addEventListener('mouseleave', () => {
        highlightStars(overlay, 0);
      });
    };
    
    const highlightStars = (overlay, rating) => {
      overlay.querySelectorAll('.docusage-rating-star').forEach((star, index) => {
        if (index < rating) {
          star.classList.add('active');
        } else {
          star.classList.remove('active');
        }
      });
    };
    
    const submitRating = async (rating) => {
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
        console.error('Error submitting rating:', error);
      }
    };
    
    const showThankYouMessage = (overlay) => {
      overlay.innerHTML = `
        <style>
          .docusage-rating-overlay {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(255, 255, 255, 0.95);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            border-radius: 12px;
          }
          .docusage-rating-thank-you {
            font-size: 16px;
            font-weight: 500;
            color: #333;
            text-align: center;
            margin-bottom: 20px;
          }
        </style>
        <div class="docusage-rating-thank-you">${ratingThankYouMessage}</div>
      `;
      
      setTimeout(() => {
        isOpen = false;
        elements.container.classList.remove("active");
      }, 2000);
    };

    const closeChat = () => {
      if (ratingEnabled && sessionId && !hasRated) {
        showRatingOverlay();
      } else {
        isOpen = false;
        elements.container.classList.remove("active");
      }
    };

    elements.header
      .querySelector(".docusage-chat-close")
      .addEventListener("click", closeChat);

    elements.input.addEventListener("input", () => {
      elements.sendButton.disabled = !elements.input.value.trim();

      // Auto-resize textarea
      elements.input.style.height = "auto";
      elements.input.style.height =
        Math.min(elements.input.scrollHeight, 120) + "px";
    });

    elements.input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    });

    elements.sendButton.addEventListener("click", handleSend);

    // Track page unload so analytics can be sent
    window.addEventListener("beforeunload", () => {
      if (isOpen && chatOpenTime > 0) {
        // If the chat is open when leaving, record that in analytics
        sendAnalytics("close");
      }
    });
  };

  // Check that the DOM has loaded
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initChatBot);
  } else {
    initChatBot();
  }
})();
