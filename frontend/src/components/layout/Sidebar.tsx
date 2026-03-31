"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Briefcase,
  MessageSquare,
  FileText,
  ChevronLeft,
  ChevronRight,
  Scale,
  Zap,
} from "lucide-react";
import { useUIStore } from "@/lib/store";

const navItems = [
  { href: "/", icon: Briefcase, label: "Cases" },
  { href: "/documents", icon: FileText, label: "Documents" },
  { href: "/chat", icon: MessageSquare, label: "Chat" },
];

export function Sidebar() {
  const pathname = usePathname();
  const { sidebarCollapsed, toggleSidebar } = useUIStore();

  return (
    <motion.aside
      animate={{ width: sidebarCollapsed ? 72 : 260 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="relative flex flex-col h-full border-r"
      style={{
        background: "rgba(8, 8, 8, 0.85)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        borderColor: "var(--color-glow-border)",
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-6">
        <div
          className="flex items-center justify-center w-9 h-9 rounded-lg"
          style={{
            background: "linear-gradient(135deg, #00ff88, #00cc6a)",
            boxShadow: "0 0 20px rgba(0, 255, 136, 0.2)",
          }}
        >
          <Scale size={18} color="#050505" strokeWidth={2.5} />
        </div>
        <AnimatePresence>
          {!sidebarCollapsed && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.15 }}
            >
              <h1
                className="text-lg font-bold tracking-tight"
                style={{
                  fontFamily: "var(--font-heading)",
                  color: "var(--color-text-primary)",
                }}
              >
                Juris<span style={{ color: "var(--color-glow-primary)" }}>Flow</span>
              </h1>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Nav Items */}
      <nav className="flex-1 px-3 space-y-1 mt-2">
        {navItems.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);

          return (
            <Link key={item.href} href={item.href}>
              <motion.div
                whileHover={{ x: 2 }}
                whileTap={{ scale: 0.98 }}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors relative"
                style={{
                  background: isActive
                    ? "rgba(0, 255, 136, 0.08)"
                    : "transparent",
                  color: isActive
                    ? "var(--color-glow-primary)"
                    : "var(--color-text-secondary)",
                }}
              >
                {isActive && (
                  <motion.div
                    layoutId="sidebar-active-indicator"
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full"
                    style={{ background: "var(--color-glow-primary)" }}
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                <item.icon size={20} strokeWidth={1.8} />
                <AnimatePresence>
                  {!sidebarCollapsed && (
                    <motion.span
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="text-sm font-medium"
                    >
                      {item.label}
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.div>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-3 pb-4 space-y-2">
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-lg"
          style={{ background: "rgba(0, 255, 136, 0.04)" }}
        >
          <Zap
            size={14}
            style={{ color: "var(--color-glow-primary)" }}
          />
          <AnimatePresence>
            {!sidebarCollapsed && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-xs"
                style={{ color: "var(--color-text-muted)" }}
              >
                GraphRAG Engine
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Toggle Button */}
      <button
        onClick={toggleSidebar}
        className="absolute -right-3 top-8 w-6 h-6 rounded-full flex items-center justify-center cursor-pointer z-10"
        style={{
          background: "var(--color-matrix-surface)",
          border: "1px solid var(--color-glow-border)",
        }}
      >
        {sidebarCollapsed ? (
          <ChevronRight size={12} style={{ color: "var(--color-text-muted)" }} />
        ) : (
          <ChevronLeft size={12} style={{ color: "var(--color-text-muted)" }} />
        )}
      </button>
    </motion.aside>
  );
}
