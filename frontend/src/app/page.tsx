"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Briefcase,
  FileText,
  Clock,
  Trash2,
  ArrowRight,
  Plus,
  Loader2,
  AlertTriangle,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { fetchCases, deleteCase } from "@/lib/api";
import type { Case } from "@/lib/api";
import { useUIStore } from "@/lib/store";

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  show: { opacity: 1, y: 0, scale: 1, transition: { type: "spring" as const, stiffness: 300, damping: 25 } },
};

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function CaseCard({ caseData }: { caseData: Case }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const queryClient = useQueryClient();
  const setActiveCaseId = useUIStore((s) => s.setActiveCaseId);

  const deleteMutation = useMutation({
    mutationFn: () => deleteCase(caseData.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["cases"] }),
  });

  const docCount = caseData.documents?.length || 0;
  const graphBuilt = caseData.documents?.some(
    (d) => d.status === "graph_built"
  );

  return (
    <motion.div variants={cardVariants} layout>
      <div className="glass-card p-5 h-full flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{
                background: "linear-gradient(135deg, rgba(0,255,136,0.12), rgba(0,204,106,0.06))",
                border: "1px solid rgba(0,255,136,0.15)",
              }}
            >
              <Briefcase size={18} style={{ color: "var(--color-glow-primary)" }} />
            </div>
            <div>
              <h3
                className="font-semibold text-sm"
                style={{ fontFamily: "var(--font-heading)", color: "var(--color-text-primary)" }}
              >
                {caseData.name}
              </h3>
              <span
                className="text-xs"
                style={{ color: "var(--color-text-muted)" }}
              >
                {caseData.domain}
              </span>
            </div>
          </div>

          {graphBuilt && (
            <div className="flex items-center gap-1 px-2 py-1 rounded-full" style={{
              background: "rgba(0,255,136,0.08)",
              border: "1px solid rgba(0,255,136,0.15)",
            }}>
              <Sparkles size={10} style={{ color: "var(--color-glow-primary)" }} />
              <span className="text-[10px] font-medium" style={{ color: "var(--color-glow-primary)" }}>
                GraphRAG
              </span>
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 mb-4">
          <div className="flex items-center gap-1.5">
            <FileText size={13} style={{ color: "var(--color-text-muted)" }} />
            <span className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
              {docCount} doc{docCount !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock size={13} style={{ color: "var(--color-text-muted)" }} />
            <span className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
              {formatDate(caseData.created_at)}
            </span>
          </div>
        </div>

        {/* Document Status Pills */}
        {docCount > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {caseData.documents.slice(0, 3).map((doc) => (
              <span
                key={doc.id}
                className={`status-badge status-${doc.status}`}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{
                    background:
                      doc.status === "graph_built"
                        ? "var(--color-status-success)"
                        : doc.status === "error"
                        ? "var(--color-status-error)"
                        : "var(--color-status-processing)",
                  }}
                />
                {doc.filename.length > 20
                  ? doc.filename.slice(0, 17) + "..."
                  : doc.filename}
              </span>
            ))}
            {docCount > 3 && (
              <span className="status-badge" style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "var(--color-text-muted)",
              }}>
                +{docCount - 3} more
              </span>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="mt-auto flex items-center justify-between pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
          <AnimatePresence mode="wait">
            {confirmDelete ? (
              <motion.div
                key="confirm"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="flex items-center gap-2"
              >
                <span className="text-xs" style={{ color: "var(--color-status-error)" }}>
                  Delete case?
                </span>
                <button
                  onClick={() => deleteMutation.mutate()}
                  className="glow-button-danger text-xs !py-1 !px-2.5"
                  disabled={deleteMutation.isPending}
                >
                  {deleteMutation.isPending ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    "Yes"
                  )}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="text-xs px-2.5 py-1 rounded-lg"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  No
                </button>
              </motion.div>
            ) : (
              <motion.button
                key="delete"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setConfirmDelete(true)}
                className="p-1.5 rounded-lg transition-colors cursor-pointer"
                style={{ color: "var(--color-text-muted)" }}
                whileHover={{ color: "#ff4444" }}
              >
                <Trash2 size={14} />
              </motion.button>
            )}
          </AnimatePresence>

          <Link
            href={`/cases/${caseData.id}`}
            onClick={() => setActiveCaseId(caseData.id)}
          >
            <motion.div
              whileHover={{ x: 3 }}
              className="flex items-center gap-1.5 text-xs font-medium cursor-pointer"
              style={{ color: "var(--color-glow-primary)" }}
            >
              Open Case
              <ArrowRight size={14} />
            </motion.div>
          </Link>
        </div>
      </div>
    </motion.div>
  );
}

function SkeletonCard() {
  return (
    <div className="glass-card p-5 h-48">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg skeleton-shimmer" />
        <div className="space-y-2">
          <div className="w-32 h-4 rounded skeleton-shimmer" />
          <div className="w-16 h-3 rounded skeleton-shimmer" />
        </div>
      </div>
      <div className="w-full h-3 rounded skeleton-shimmer mb-3" />
      <div className="w-2/3 h-3 rounded skeleton-shimmer" />
    </div>
  );
}

export default function CasesDashboard() {
  const { data: cases, isLoading, error } = useQuery({
    queryKey: ["cases"],
    queryFn: fetchCases,
  });

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Page Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <div className="flex items-center justify-between">
          <div>
            <h1
              className="text-2xl font-bold mb-1"
              style={{ fontFamily: "var(--font-heading)", color: "var(--color-text-primary)" }}
            >
              Case Dashboard
            </h1>
            <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
              Manage your legal cases and knowledge graphs
            </p>
          </div>
        </div>
      </motion.div>

      {/* Error State */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-6 flex items-center gap-4 mb-6"
          style={{ borderColor: "rgba(255,68,68,0.2)" }}
        >
          <AlertTriangle size={20} style={{ color: "var(--color-status-error)" }} />
          <div>
            <p className="text-sm font-medium" style={{ color: "var(--color-status-error)" }}>
              Failed to connect to backend
            </p>
            <p className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>
              Make sure the JurisFlow backend is running on port 8000
            </p>
          </div>
        </motion.div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[...Array(6)].map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !error && cases?.length === 0 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-card p-12 text-center"
        >
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{
              background: "linear-gradient(135deg, rgba(0,255,136,0.1), rgba(0,204,106,0.05))",
              border: "1px solid rgba(0,255,136,0.1)",
            }}
          >
            <Briefcase size={28} style={{ color: "var(--color-glow-dim)" }} />
          </div>
          <h2
            className="text-lg font-semibold mb-2"
            style={{ fontFamily: "var(--font-heading)", color: "var(--color-text-primary)" }}
          >
            No cases yet
          </h2>
          <p className="text-sm mb-6" style={{ color: "var(--color-text-muted)" }}>
            Upload a document to an existing case ID or create one through the API.
          </p>
          <Link href="/documents">
            <button className="glow-button-solid flex items-center gap-2 mx-auto">
              <Plus size={16} />
              Upload Documents
            </button>
          </Link>
        </motion.div>
      )}

      {/* Case Grid */}
      {!isLoading && cases && cases.length > 0 && (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5"
        >
          {cases.map((c) => (
            <CaseCard key={c.id} caseData={c} />
          ))}
        </motion.div>
      )}
    </div>
  );
}
