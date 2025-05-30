"use client";

import { useState, useRef, useEffect } from "react";
import { useTheme } from "@/context/ThemeContext";
import { X } from "lucide-react";

interface TerminalProps {
  onClose?: () => void;
}

export default function Terminal({ onClose }: TerminalProps) {
  const [history, setHistory] = useState<string[]>([]);
  const [currentInput, setCurrentInput] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const ws = new WebSocket("ws://localhost:3001");
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("✅ WebSocket connected");
    };

    ws.onmessage = (event) => {
      const message = event.data.toString();
      setHistory((prev) => [...prev, message]);
    };

    ws.onerror = (e) => {
      if (ws.readyState !== WebSocket.CLOSED) {
        console.error("❌ WebSocket error", e);
      }
    };

    ws.onclose = () => {
      console.warn("🔌 WebSocket disconnected");
    };

    return () => ws.close();
  }, []);

  useEffect(() => {
    containerRef.current?.scrollTo({
      top: containerRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [history]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const input = currentInput.trim();
    if (!input) return;

    // Show input in history
    setHistory((prev) => [...prev, `$ ${input}`]);

    // Special case for clear
    if (input === "clear") {
      setHistory([]);
    } else {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
  wsRef.current.send(input);
}

    }

    setCurrentInput("");
  };

  return (
    <div
      className={`w-full h-full flex flex-col font-mono text-sm ${
        isDark ? "bg-[#1e1e1e] text-[#c5c5c5]" : "bg-gray-100 text-gray-800"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-600/40">
        <span className="text-xs font-semibold uppercase tracking-wider">Terminal</span>
        {onClose && (
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-red-400 transition-colors"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Terminal output and input */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-1"
      >
        {history.map((line, i) => (
          <div key={i}>{line}</div>
        ))}

        <form onSubmit={handleSubmit} className="flex gap-2 items-center mt-1">
          <span className="text-green-400">$</span>
          <input
            value={currentInput}
            onChange={(e) => setCurrentInput(e.target.value)}
            className={`w-full bg-transparent outline-none ${
              isDark ? "text-white placeholder-gray-500" : "text-black placeholder-gray-400"
            }`}
            placeholder="Enter a command..."
            autoFocus
          />
        </form>
      </div>
    </div>
  );
}
