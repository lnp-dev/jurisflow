"use client";

import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  FileText,
  Briefcase,
  ArrowRight,
  Search,
  ChevronDown,
} from "lucide-react";
import Link from "next/link";
import { useState, useMemo } from "react";
import { fetchCases } from "@/lib/api";
import type { Case, Document } from "@/lib/api";

const statusConfig: Record<string, { bg: string; text: string }> = {
  uploaded: { bg: "rgba(0,170,255,0.08)", text: "#00aaff" },
  parsed: { bg: "rgba(170,102,255,0.08)", text: "#aa66ff" },
  redacted: { bg: "rgba(170,102,255,0.08)", text: "#aa66ff" },
  graph_built: { bg: "rgba(0,255,136,0.08)", text: "#00ff88" },
  error: { bg: "rgba(255,68,68,0.08)", text: "#ff4444" },
};

export default function DocumentsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: cases, isLoading } = useQuery({
    queryKey: ["cases"],
    queryFn: fetchCases,
  });

  const allDocs = useMemo(() => {
    if (!cases) return [];
    return cases.flatMap((c) =>
      (c.documents || []).map((d) => ({ ...d, caseName: c.name, caseId: c.id }))
    );
  }, [cases]);

  const filteredDocs = useMemo(() => {
    return allDocs.filter((d) => {
      const matchesSearch =
        d.filename.toLowerCase().includes(search.toLowerCase()) ||
        d.caseName.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === "all" || d.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [allDocs, search, statusFilter]);

  const statuses = ["all", "uploaded", "parsed", "redacted", "graph_built", "error"];

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1
          className="text-2xl font-bold mb-1"
          style={{
            fontFamily: "var(--font-heading)",
            color: "var(--color-text-primary)",
          }}
        >
          Document Center
        </h1>
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          Browse all documents across your cases
        </p>
      </motion.div>

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="flex items-center gap-3 mb-6 flex-wrap"
      >
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: "var(--color-text-muted)" }}
          />
          <input
            type="text"
            placeholder="Search by filename or case..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="glass-input w-full pl-9 pr-4 py-2.5 text-sm"
          />
        </div>

        {/* Status Filter */}
        <div className="flex items-center gap-1.5">
          {statuses.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className="text-xs px-3 py-1.5 rounded-full transition-all cursor-pointer capitalize"
              style={{
                background:
                  statusFilter === s
                    ? s === "all"
                      ? "rgba(0,255,136,0.1)"
                      : statusConfig[s]?.bg || "rgba(0,255,136,0.1)"
                    : "transparent",
                color:
                  statusFilter === s
                    ? s === "all"
                      ? "#00ff88"
                      : statusConfig[s]?.text || "#00ff88"
                    : "var(--color-text-muted)",
                border: `1px solid ${
                  statusFilter === s
                    ? s === "all"
                      ? "rgba(0,255,136,0.2)"
                      : (statusConfig[s]?.text || "#00ff88") + "33"
                    : "transparent"
                }`,
              }}
            >
              {s === "graph_built" ? "graph" : s}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Document Table */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="glass-panel overflow-hidden"
      >
        {/* Table Header */}
        <div
          className="grid grid-cols-[1fr_150px_120px_100px] gap-4 px-4 py-3 text-xs font-medium"
          style={{
            color: "var(--color-text-muted)",
            borderBottom: "1px solid rgba(255,255,255,0.04)",
            background: "rgba(0,0,0,0.2)",
          }}
        >
          <span>Filename</span>
          <span>Case</span>
          <span>Status</span>
          <span className="text-right">Action</span>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="p-6 space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-10 rounded skeleton-shimmer" />
            ))}
          </div>
        )}

        {/* Empty */}
        {!isLoading && filteredDocs.length === 0 && (
          <div className="p-12 text-center">
            <FileText
              size={28}
              className="mx-auto mb-3"
              style={{ color: "var(--color-text-muted)" }}
            />
            <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
              {allDocs.length === 0
                ? "No documents found. Upload documents through a case page."
                : "No documents match your search."}
            </p>
          </div>
        )}

        {/* Rows */}
        {filteredDocs.map((doc, i) => (
          <motion.div
            key={doc.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.03 }}
            className="grid grid-cols-[1fr_150px_120px_100px] gap-4 px-4 py-3 items-center transition-colors"
            style={{
              borderBottom: "1px solid rgba(255,255,255,0.03)",
            }}
            whileHover={{
              backgroundColor: "rgba(0,255,136,0.02)",
            }}
          >
            {/* Filename */}
            <div className="flex items-center gap-2.5 min-w-0">
              <FileText
                size={15}
                style={{ color: "var(--color-glow-dim)" }}
                className="shrink-0"
              />
              <span
                className="text-sm truncate"
                style={{ color: "var(--color-text-primary)" }}
              >
                {doc.filename}
              </span>
            </div>

            {/* Case */}
            <div className="flex items-center gap-1.5 min-w-0">
              <Briefcase size={12} style={{ color: "var(--color-text-muted)" }} />
              <span
                className="text-xs truncate"
                style={{ color: "var(--color-text-secondary)" }}
              >
                {doc.caseName}
              </span>
            </div>

            {/* Status */}
            <span className={`status-badge status-${doc.status}`}>
              {doc.status === "graph_built" ? "Graph" : doc.status}
            </span>

            {/* Action */}
            <div className="text-right">
              <Link href={`/cases/${doc.caseId}`}>
                <motion.span
                  whileHover={{ x: 3 }}
                  className="inline-flex items-center gap-1 text-xs cursor-pointer"
                  style={{ color: "var(--color-glow-dim)" }}
                >
                  View
                  <ArrowRight size={12} />
                </motion.span>
              </Link>
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* Total Count */}
      {!isLoading && (
        <p
          className="text-xs mt-4 text-right"
          style={{ color: "var(--color-text-muted)" }}
        >
          {filteredDocs.length} of {allDocs.length} document
          {allDocs.length !== 1 ? "s" : ""}
        </p>
      )}
    </div>
  );
}
