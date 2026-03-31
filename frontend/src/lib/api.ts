/* ============================================
   JurisFlow API Client
   ============================================ */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/* ---------- Types ---------- */

export interface Case {
  id: string;
  name: string;
  domain: string;
  created_at: string;
  documents: Document[];
}

export interface Document {
  id: string;
  case_id: string;
  filename: string;
  file_path: string;
  status: string;
  error_message: string | null;
}

export interface DocumentChunk {
  id: string;
  document_id: string;
  raw_text: string;
  redacted_text: string | null;
  page_number: number | null;
  bounding_box: number[] | null;
  is_graph_processed: boolean;
}

export interface DocumentDetail {
  document: Document;
  chunks: DocumentChunk[];
}

export interface Citation {
  source: string;
  chunk_id: string;
  document_id: string;
  page: number | null;
  bbox?: number[] | null;
  text: string;
}

export interface ChatResponse {
  answer: string;
  citations: Citation[];
}

export interface StreamEvent {
  type: "content" | "citations" | "error";
  delta?: string;
  content?: string;
  citations?: Citation[];
}

/* ---------- Cases ---------- */

export async function fetchCases(): Promise<Case[]> {
  const res = await fetch(`${API_BASE}/api/cases`);
  if (!res.ok) throw new Error("Failed to fetch cases");
  return res.json();
}

export async function deleteCase(caseId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/cases/${caseId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to delete case");
}

/* ---------- Documents ---------- */

export async function fetchDocuments(caseId: string): Promise<Document[]> {
  const res = await fetch(`${API_BASE}/api/cases/${caseId}/documents`);
  if (!res.ok) throw new Error("Failed to fetch documents");
  return res.json();
}

export async function fetchDocumentDetail(
  caseId: string,
  documentId: string
): Promise<DocumentDetail> {
  const res = await fetch(
    `${API_BASE}/api/cases/${caseId}/documents/${documentId}`
  );
  if (!res.ok) throw new Error("Failed to fetch document detail");
  return res.json();
}

export async function uploadDocument(
  caseId: string,
  file: File
): Promise<{ status: string; document_id: string; message: string }> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${API_BASE}/api/cases/${caseId}/documents`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) throw new Error("Failed to upload document");
  return res.json();
}

export async function deleteDocument(
  caseId: string,
  documentId: string
): Promise<void> {
  const res = await fetch(
    `${API_BASE}/api/cases/${caseId}/documents/${documentId}`,
    { method: "DELETE" }
  );
  if (!res.ok) throw new Error("Failed to delete document");
}

export async function buildGraph(
  caseId: string
): Promise<{ status: string; nodes?: number; edges?: number }> {
  const res = await fetch(`${API_BASE}/api/cases/${caseId}/build-graph`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("Failed to build graph");
  return res.json();
}

/* ---------- Chat ---------- */

export async function askQuestion(
  caseId: string,
  prompt: string
): Promise<ChatResponse> {
  const res = await fetch(`${API_BASE}/api/chat/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ case_id: caseId, prompt }),
  });
  if (!res.ok) throw new Error("Failed to ask question");
  return res.json();
}

export async function askQuestionStream(
  caseId: string,
  prompt: string,
  onDelta: (delta: string) => void,
  onCitations: (citations: Citation[]) => void,
  onError: (error: string) => void
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/chat/ask-stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ case_id: caseId, prompt }),
  });

  if (!res.ok) {
    onError("Failed to start stream");
    return;
  }

  const reader = res.body?.getReader();
  if (!reader) {
    onError("No response body");
    return;
  }

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (data === "[DONE]") return;

      try {
        const event: StreamEvent = JSON.parse(data);
        if (event.type === "content" && event.delta) {
          onDelta(event.delta);
        } else if (event.type === "citations" && event.citations) {
          onCitations(event.citations);
        } else if (event.type === "error") {
          onError(event.content || "Unknown error");
        }
      } catch {
        // Ignore malformed lines
      }
    }
  }
}
