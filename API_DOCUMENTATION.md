# DocuSage Platform API Documentation

## Authentication

All API endpoints require authentication via API key in the header:
```
X-API-Key: your_api_key_here
```

You can find your API key in the project settings under "API" tab.

## Base URL Structure

All API endpoints follow this pattern:
```
https://your-domain.com/api/p/{PROJECT_ID}/endpoint
```

Where `{PROJECT_ID}` is your project's ID number.

## Available Endpoints

### 1. Get Project Information

**GET** `/api/p/{PROJECT_ID}/info`

Returns basic project information and list of uploaded documents.

**Response:**
```json
{
  "success": true,
  "project": {
    "id": 123,
    "name": "My Project",
    "colorTheme": "blue", 
    "createdAt": "2025-01-01T00:00:00.000Z",
    "description": "Project description",
    "pdfs": [
      {
        "id": 1,
        "fileName": "document.pdf",
        "uploadedAt": "2025-01-01T00:00:00.000Z"
      }
    ]
  }
}
```

### 2. Send Chat Message

**POST** `/api/p/{PROJECT_ID}/chat`

Send a message to the AI chatbot and get a response.

**Request Body:**
```json
{
  "message": "What is this document about?"
}
```

**Response:**
```json
{
  "success": true,
  "response": "Based on the uploaded documents...",
  "sessionId": "abc123",
  "error": null
}
```

### 3. Continue Chat Conversation

**POST** `/api/p/{PROJECT_ID}/chat/{SESSION_ID}`

Continue an existing chat conversation.

**Request Body:**
```json
{
  "message": "Tell me more about that topic"
}
```

**Response:**
```json
{
  "success": true,
  "response": "Here are more details...",
  "sessionId": "abc123",
  "error": null
}
```

### 4. Get Chat History

**GET** `/api/p/{PROJECT_ID}/chat/{SESSION_ID}`

Retrieve the conversation history for a specific chat session.

**Response:**
```json
{
  "success": true,
  "sessionId": "abc123",
  "messages": [
    {
      "role": "user",
      "content": "What is this document about?",
      "timestamp": "2025-01-01T00:00:00.000Z"
    },
    {
      "role": "assistant", 
      "content": "Based on the documents...",
      "timestamp": "2025-01-01T00:00:01.000Z"
    }
  ]
}
```

### 5. List Documents (NEW)

**GET** `/api/p/{PROJECT_ID}/documents`

Get a list of all documents uploaded to the project.

**Response:**
```json
{
  "success": true,
  "documents": [
    {
      "id": 1,
      "filename": "document.pdf",
      "content": "Extracted text content...",
      "totalPages": 10,
      "fileSize": 1024000,
      "processingStatus": "completed",
      "processingError": null,
      "createdAt": "2025-01-01T00:00:00.000Z",
      "processedAt": "2025-01-01T00:00:05.000Z"
    }
  ]
}
```

### 6. Upload Document (NEW)

**POST** `/api/p/{PROJECT_ID}/documents`

Upload a new document to the project by providing text content.

**Request Body:**
```json
{
  "filename": "my-document.txt",
  "content": "This is the text content of the document...",
  "totalPages": 5,
  "fileSize": 1024
}
```

**Required Fields:**
- `filename` (string) - Name of the document
- `content` (string) - Text content of the document

**Optional Fields:**
- `totalPages` (number) - Number of pages in the document
- `fileSize` (number) - Size of the document in bytes

**Response:**
```json
{
  "success": true,
  "message": "Document uploaded successfully",
  "document": {
    "id": 123,
    "filename": "my-document.txt",
    "content": "This is the text content...",
    "totalPages": 5,
    "fileSize": 1024,
    "processingStatus": "completed",
    "createdAt": "2025-01-01T00:00:00.000Z",
    "processedAt": "2025-01-01T00:00:00.000Z"
  }
}
```

### 7. Delete Document (NEW)

**DELETE** `/api/p/{PROJECT_ID}/documents/{DOCUMENT_ID}`

Delete a specific document from the project.

**Response:**
```json
{
  "success": true,
  "message": "Document deleted successfully",
  "deletedDocumentId": 123
}
```

### 8. Upload Bot Icon

**POST** `/api/projects/{PROJECT_ID}/bot-icon`

> Note: the bot icon endpoints live under `/api/projects/`, not `/api/p/`, and
> they authenticate with your **session** (you must be signed in and have access
> to the project) rather than with an API key.

Upload a custom icon for the chatbot. Icon should be a square image (PNG, JPG, GIF) with maximum size of 2MB.

**Request Body (Form Data):**
- `icon` (file) - Image file for the bot icon

**Response:**
```json
{
  "success": true,
  "message": "Bot icon uploaded successfully",
  "iconUrl": "/api/projects/123/bot-icon"
}
```

### 9. Get Bot Icon

**GET** `/api/projects/{PROJECT_ID}/bot-icon`

Retrieve the current bot icon for the project.

**Response:**
Returns the image file directly with appropriate Content-Type header, or 404 if no icon is uploaded.

### 10. Delete Bot Icon

**DELETE** `/api/projects/{PROJECT_ID}/bot-icon`

Delete the current bot icon for the project.

**Response:**
```json
{
  "success": true,
  "message": "Bot icon deleted successfully"
}
```

## Contact requests

A project can be set to offer a contact form when the chatbot cannot answer:
**Project → Chatbot settings → Contact requests**. Off by default.

When it is on and an answer is one the visitor cannot use, the chat response
carries the text to show:

```json
{
  "message": { "content": "I could not find that in the documents." },
  "sessionId": 42,
  "leadCapture": {
    "prompt": "I could not find an answer to that. Leave us your email and we will get back to you.",
    "thankYou": "Thank you, we will be in touch."
  }
}
```

`leadCapture` is absent whenever the form should not be offered — the setting is
off, or the answer was a real one. The decision is the server's: which phrases
count as a failure changes over time, and a widget cached in somebody's browser
would never learn a new one.

The streaming endpoint carries the same field on its `done` event, so a streamed
answer offers the form on exactly the same terms as a plain one.

**POST** `/api/chat-embed/lead`

```json
{
  "token": "your-project-token",
  "sessionId": 42,
  "email": "someone@example.com",
  "name": "optional",
  "message": "optional",
  "question": "the question that went unanswered",
  "pageUrl": "https://example.com/contact"
}
```

Only `token` and `email` are required. Responses:

| Status | Meaning |
| --- | --- |
| 201 | Stored. The body carries the project's thank-you message. |
| 400 | The email address is not valid, or a field is over its length limit. |
| 403 | The project does not collect contact details, or the request's `Origin` is not on the project's allowed-domain list. |
| 404 | Unknown token. |
| 429 | Too many submissions from this address — see `LEAD_RATE_LIMIT_PER_10_MINUTES`. |

The lead is stored before any email is attempted, and a failure to notify is not
reported to the visitor. Without an SMTP server configured, requests still
arrive — they are listed on the project page, marked as not notified.

## Embed limits

A project can restrict where its widget runs and how much it costs. Both are off
by default, so a project that never opens these settings behaves as before.

| Response | When |
| --- | --- |
| 403 | The request's `Origin` is not on the project's allowed-domain list. The message deliberately does not name the allowed domains. |
| 429 | The project has reached its message limit for the calendar month. |

The allowed-domain list covers `/api/chat-embed/lead` too. The monthly message
limit does not: a contact form is not a message, and a project that has spent
its allowance for the month should still be able to collect the details of the
person who asked.

The check uses the `Origin` header, falling back to `Referer` only to find a
host — never to allow something `Origin` denied. A request with no origin at all
is refused once a list exists: a browser always sends one on a cross-origin
POST, so something that does not is not the widget.

## Streaming answers

The embed widget endpoint has a streaming counterpart at
`POST /api/chat-embed/stream`. It takes the same body as `/api/chat-embed`
(`message`, `token`, and an optional `sessionId`) and replies with a
`text/event-stream` instead of JSON:

```
event: session
data: {"sessionId":42}

event: delta
data: {"text":"Splatnost "}

event: delta
data: {"text":"faktury je 30 dnů."}

event: done
data: {"message":{"id":91,"content":"Splatnost faktury je 30 dnů.","isFromUser":false},"sessionId":42}
```

- `session` arrives first and carries the session to send with the next message.
- `delta` carries one piece of the answer. Concatenated, the deltas equal the
  final text.
- `done` closes the stream. It carries the stored message, the session, and —
  when the project asks for contact details and this answer failed — the same
  `leadCapture` object the plain endpoint returns.
- `error` closes the stream after a failure. Note that a failure discovered
  after the first byte cannot be reported as an HTTP status code, so a client
  has to handle this event rather than relying on the status.

Not every project streams token by token. Answers generated without retrieval —
a project with no documents, or one whose provider has no streaming API — arrive
as a single `delta` followed by `done`. Clients need no special case for that:
the event sequence is the same either way.

The non-streaming endpoint is not deprecated and is not going away. Widget
scripts sit in third-party pages and browser caches, so both have to keep
working indefinitely.

## Error Responses

All endpoints may return error responses in this format:

```json
{
  "success": false,
  "error": "Error message description"
}
```

Common HTTP status codes:
- `400` - Bad Request (missing/invalid parameters)
- `401` - Unauthorized (invalid API key)
- `403` - Forbidden (API disabled for project)
- `404` - Not Found (project/document not found)
- `429` - Too Many Requests (rate limit exceeded)
- `500` - Internal Server Error

## Rate Limits

Each project has a daily API call limit (default: 100 calls per day).
You can check and modify this limit in your project settings.

On top of that, every request under `/api` is limited per IP address —
`API_RATE_LIMIT_PER_MINUTE`, 300 by default. It is a ceiling rather than a
policy: no route should be completely unlimited, and the per-endpoint limits
below it are the ones tuned to what each endpoint costs. The response carries the
standard `RateLimit` and `Retry-After` headers.

## Examples

### Upload and Chat with Document

1. First, upload a document:
```bash
curl -X POST "https://your-domain.com/api/p/123/documents" \
  -H "X-API-Key: your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "filename": "company-policy.txt",
    "content": "Our company policy states that employees must..."
  }'
```

2. Then ask questions about it:
```bash
curl -X POST "https://your-domain.com/api/p/123/chat" \
  -H "X-API-Key: your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What does the company policy say about remote work?"
  }'
```

### List All Documents
```bash
curl -X GET "https://your-domain.com/api/p/123/documents" \
  -H "X-API-Key: your_api_key"
```

### Delete a Document
```bash
curl -X DELETE "https://your-domain.com/api/p/123/documents/456" \
  -H "X-API-Key: your_api_key"
```