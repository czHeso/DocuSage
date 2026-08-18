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

## Citations

A project can be set to attribute its answers: **Project → Training options → Cite
sources in answers**. It is off by default, because it costs extra tokens on every
question and only works for projects whose documents have been processed into
chunks.

With it on, the answer text carries markers and the response carries the
documents behind them:

```json
{
  "message": { "content": "Splatnost faktury je 30 dnů [1]." },
  "sessionId": 42,
  "sources": [
    { "index": 1, "chunkId": 913, "pdfId": 7, "filename": "prirucka.pdf", "pageRange": "12" }
  ]
}
```

`index` is the number that appears in the text, so a client can turn `[1]` into a
link. `sources` lists only what the answer actually cited — an answer that cites
nothing returns an empty array rather than everything that was retrieved, and a
marker pointing at a number the model invented is dropped rather than attributed
to the wrong document.

`sources` is always present and is always an array. With citations off, or on an
answer produced without retrieval, it is empty.

The embed widget renders the list under the answer. Its heading and the page
abbreviation can be changed with `data-sources-label` and `data-page-label` on
the script tag.

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