"use client";

import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  FileText,
  Trash2,
  Upload,
  Brain,
  Loader2,
  CheckCircle,
  AlertCircle,
  Eye,
  MessageSquare,
  ChevronDown,
  ChevronRight,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import {
  fetchCases,
  fetchDocuments,
  fetchDocumentDetail,
  uploadDocument,
  deleteDocument,
  buildGraph,
} from "@/lib/api";
import type { Case, Document, DocumentChunk } from "@/lib/api";

const statusConfig: Record<string, { color: string; label: string; icon: typeof CheckCircle }> = {
  uploaded: { color: "#00aaff", label: "Uploaded", icon: Upload },
  parsed: { color: "#aa66ff", label: "Parsed", icon: Eye },
  redacted: { color: "#aa66ff", label: "Redacted", icon: Eye },
  graph_built: { color: "#00ff88", label: "Graph Built", icon: CheckCircle },
  error: { color: "#ff4444", label: "Error", icon: AlertCircle },
};

function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] || statusConfig.uploaded;
  const Icon = config.icon;
  return (
    <span
      className={`status-badge status-${status}`}
    >
      <Icon size={11} />
      {config.label}
    </span>
  );
}

function DocumentRow({
  doc,
  caseId,
  onExpand,
  isExpanded,
}: {
  doc: Document;
  caseId: string;
  onExpand: () => void;
  isExpanded: boolean;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: () => deleteDocument(caseId, doc.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents", caseId] });
      queryClient.invalidateQueries({ queryKey: ["cases"] });
    },
  });

  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ["document-detail", caseId, doc.id],
    queryFn: () => fetchDocumentDetail(caseId, doc.id),
    enabled: isExpanded,
  });

  return (
    <motion.div layout className="glass-card overflow-hidden">
      {/* Row Header */}
      <div
        className="flex items-center justify-between p-4 cursor-pointer"
        onClick={onExpand}
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
            style={{
              background: "rgba(0,255,136,0.06)",
              border: "1px solid rgba(0,255,136,0.1)",
            }}
          >
            <FileText size={16} style={{ color: "var(--color-glow-dim)" }} />
          </div>
          <div className="min-w-0">
            <p
              className="text-sm font-medium truncate"
              style={{ color: "var(--color-text-primary)" }}
            >
              {doc.filename}
            </p>
            <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
              ID: {doc.id.slice(0, 8)}...
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <StatusBadge status={doc.status} />

          <AnimatePresence mode="wait">
            {confirmDelete ? (
              <motion.div
                key="confirm"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="flex items-center gap-1.5"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={() => deleteMutation.mutate()}
                  className="glow-button-danger text-xs !py-1 !px-2"
                  disabled={deleteMutation.isPending}
                >
                  {deleteMutation.isPending ? (
                    <Loader2 size={11} className="animate-spin" />
                  ) : (
                    "Delete"
                  )}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="text-xs px-2 py-1"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  Cancel
                </button>
              </motion.div>
            ) : (
              <motion.button
                key="trash"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmDelete(true);
                }}
                className="p-1.5 rounded-lg cursor-pointer"
                style={{ color: "var(--color-text-muted)" }}
                whileHover={{ color: "#ff4444" }}
              >
                <Trash2 size={14} />
              </motion.button>
            )}
          </AnimatePresence>

          <motion.div
            animate={{ rotate: isExpanded ? 90 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronRight
              size={14}
              style={{ color: "var(--color-text-muted)" }}
            />
          </motion.div>
        </div>
      </div>

      {/* Error Message */}
      {doc.error_message && (
        <div className="px-4 pb-3">
          <div
            className="flex items-center gap-2 p-2.5 rounded-lg text-xs"
            style={{
              background: "rgba(255,68,68,0.06)",
              border: "1px solid rgba(255,68,68,0.12)",
              color: "var(--color-status-error)",
            }}
          >
            <AlertCircle size={12} />
            {doc.error_message}
          </div>
        </div>
      )}

      {/* Expanded Chunks */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div
              className="px-4 pb-4 pt-2 space-y-3"
              style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}
            >
              <p
                className="text-xs font-medium"
                style={{ color: "var(--color-text-secondary)" }}
              >
                Document Chunks
              </p>

              {detailLoading && (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-16 rounded-lg skeleton-shimmer" />
                  ))}
                </div>
              )}

              {detail?.chunks && detail.chunks.length === 0 && (
                <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                  No chunks available yet. The document may still be processing.
                </p>
              )}

              {detail?.chunks &&
                detail.chunks.map((chunk, idx) => (
                  <ChunkPreview key={chunk.id} chunk={chunk} index={idx} />
                ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function ChunkPreview({ chunk, index }: { chunk: DocumentChunk; index: number }) {
  const [showRaw, setShowRaw] = useState(false);
  const displayText = showRaw ? chunk.raw_text : (chunk.redacted_text || chunk.raw_text);

  return (
    <div
      className="p-3 rounded-lg"
      style={{
        background: "rgba(5,5,5,0.5)",
        border: "1px solid rgba(255,255,255,0.04)",
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{
            background: "rgba(0,255,136,0.06)",
            color: "var(--color-glow-dim)",
          }}>
            Chunk #{index + 1}
          </span>
          {chunk.page_number && (
            <span className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>
              Page {chunk.page_number}
            </span>
          )}
          {chunk.is_graph_processed && (
            <span className="text-[10px] flex items-center gap-1" style={{ color: "var(--color-glow-dim)" }}>
              <Brain size={9} /> In Graph
            </span>
          )}
        </div>
        {chunk.redacted_text && (
          <button
            onClick={() => setShowRaw(!showRaw)}
            className="text-[10px] px-2 py-0.5 rounded cursor-pointer"
            style={{
              background: showRaw ? "rgba(255,170,0,0.1)" : "rgba(0,255,136,0.06)",
              color: showRaw ? "var(--color-status-warning)" : "var(--color-glow-dim)",
              border: `1px solid ${showRaw ? "rgba(255,170,0,0.2)" : "rgba(0,255,136,0.1)"}`,
            }}
          >
            {showRaw ? "Raw" : "Redacted"}
          </button>
        )}
      </div>
      <p
        className="text-xs leading-relaxed max-h-32 overflow-y-auto"
        style={{
          color: "var(--color-text-secondary)",
          fontFamily: "var(--font-mono)",
          fontSize: "11px",
        }}
      >
        {displayText && displayText.length > 500
          ? displayText.slice(0, 500) + "..."
          : displayText}
      </p>
    </div>
  );
}

export default function CaseDetailPage() {
  const params = useParams();
  const caseId = params.caseId as string;
  const queryClient = useQueryClient();
  const [expandedDoc, setExpandedDoc] = useState<string | null>(null);

  const { data: cases } = useQuery({
    queryKey: ["cases"],
    queryFn: fetchCases,
  });

  const currentCase = cases?.find((c) => c.id === caseId);

  const { data: documents, isLoading: docsLoading } = useQuery({
    queryKey: ["documents", caseId],
    queryFn: () => fetchDocuments(caseId),
    refetchInterval: 5000,
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadDocument(caseId, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents", caseId] });
      queryClient.invalidateQueries({ queryKey: ["cases"] });
    },
  });

  const graphMutation = useMutation({
    mutationFn: () => buildGraph(caseId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents", caseId] });
      queryClient.invalidateQueries({ queryKey: ["cases"] });
    },
  });

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      acceptedFiles.forEach((file) => uploadMutation.mutate(file));
    },
    [uploadMutation]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
    },
  });

  const hasRedactedDocs = documents?.some(
    (d) => d.status === "redacted" || d.status === "parsed"
  );

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Breadcrumb */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <Link
          href="/"
          className="flex items-center gap-2 text-sm mb-4"
          style={{ color: "var(--color-text-muted)" }}
        >
          <ArrowLeft size={14} />
          Back to Cases
        </Link>

        <div className="flex items-center justify-between">
          <div>
            <h1
              className="text-2xl font-bold mb-1"
              style={{
                fontFamily: "var(--font-heading)",
                color: "var(--color-text-primary)",
              }}
            >
              {currentCase?.name || `Case ${caseId.slice(0, 8)}...`}
            </h1>
            <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
              {currentCase?.domain || "M&A"} · {documents?.length || 0} document
              {(documents?.length || 0) !== 1 ? "s" : ""}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link href={`/chat?case=${caseId}`}>
              <button className="glow-button flex items-center gap-2 text-sm">
                <MessageSquare size={15} />
                Chat
              </button>
            </Link>
            <button
              onClick={() => graphMutation.mutate()}
              disabled={graphMutation.isPending || !hasRedactedDocs}
              className="glow-button-solid flex items-center gap-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {graphMutation.isPending ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <Brain size={15} />
              )}
              Build Graph
            </button>
          </div>
        </div>

        {graphMutation.isSuccess && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-3 px-3 py-2 rounded-lg flex items-center gap-2 text-xs"
            style={{
              background: "rgba(0,255,136,0.06)",
              border: "1px solid rgba(0,255,136,0.12)",
              color: "var(--color-glow-primary)",
            }}
          >
            <CheckCircle size={13} />
            Knowledge Graph built successfully!
          </motion.div>
        )}
      </motion.div>

      {/* Upload Zone */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="mb-6"
      >
        <div
          {...getRootProps()}
          className={`glass-card p-8 text-center cursor-pointer transition-all ${
            isDragActive ? "dropzone-active" : ""
          }`}
          style={{
            borderStyle: "dashed",
          }}
        >
          <input {...getInputProps()} />
          <Upload
            size={28}
            className="mx-auto mb-3"
            style={{
              color: isDragActive
                ? "var(--color-glow-primary)"
                : "var(--color-text-muted)",
            }}
          />
          <p className="text-sm mb-1" style={{ color: "var(--color-text-secondary)" }}>
            {isDragActive
              ? "Drop your files here..."
              : "Drag & drop legal documents here"}
          </p>
          <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
            Supports PDF and DOCX · Files are processed in the background
          </p>
          {uploadMutation.isPending && (
            <div className="flex items-center justify-center gap-2 mt-3" style={{ color: "var(--color-glow-primary)" }}>
              <Loader2 size={14} className="animate-spin" />
              <span className="text-xs">Uploading...</span>
            </div>
          )}
        </div>
      </motion.div>

      {/* Document List */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="space-y-3"
      >
        <h2
          className="text-sm font-semibold mb-3"
          style={{ fontFamily: "var(--font-heading)", color: "var(--color-text-secondary)" }}
        >
          Documents
        </h2>

        {docsLoading && (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="glass-card p-4 h-16 skeleton-shimmer" />
            ))}
          </div>
        )}

        {!docsLoading && documents?.length === 0 && (
          <div className="glass-card p-8 text-center">
            <FileText
              size={28}
              className="mx-auto mb-3"
              style={{ color: "var(--color-text-muted)" }}
            />
            <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
              No documents uploaded yet. Drop files above to get started.
            </p>
          </div>
        )}

        <AnimatePresence>
          {documents?.map((doc) => (
            <DocumentRow
              key={doc.id}
              doc={doc}
              caseId={caseId}
              isExpanded={expandedDoc === doc.id}
              onExpand={() =>
                setExpandedDoc(expandedDoc === doc.id ? null : doc.id)
              }
            />
          ))}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
