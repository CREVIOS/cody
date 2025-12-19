"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { FaEye, FaEyeSlash } from "react-icons/fa";
import { ThemeToggle } from "@/components/welcomepage/ThemeToggle";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { signUp } = useAuth();
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await signUp(email, password, {
        full_name: fullName.trim() || undefined,
        avatar_url: avatarUrl.trim() || undefined
      });
      // Wait a bit for sync to complete, then redirect
      await new Promise(resolve => setTimeout(resolve, 1000));
      // Clear any stored view so authenticated user goes to entry page
      localStorage.removeItem("app-current-view");
      router.push("/");
      router.refresh(); // Force refresh to reload user data
    } catch (err: any) {
      setError(err.message || "Failed to sign up");
    } finally {
      setLoading(false);
    }
  };

  const backgroundClass = theme === "dark" 
    ? "bg-[#212124] text-[#E0E0E0]" 
    : "bg-[#F5F5F0] text-[#2D2D2D]";

  const cardClass = theme === "dark"
    ? "bg-[#2A2A2E] border-[#3A3A3E]"
    : "bg-white border-gray-200";

  const inputClass = theme === "dark" 
    ? "w-full px-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500/20 bg-[#212124] border-[#3A3A3E] text-[#E0E0E0]"
    : "w-full px-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500/20 bg-white border-gray-300 text-[#2D2D2D]";

  return (
    <div className={`min-h-screen flex items-center justify-center p-8 relative ${backgroundClass}`} suppressHydrationWarning>
      {/* Theme Toggle - Top Right */}
      <div className="absolute top-8 right-8" suppressHydrationWarning>
        <ThemeToggle theme={theme} onToggle={toggleTheme} />
      </div>

      <div className={`w-full max-w-md p-8 rounded-xl border shadow-lg ${cardClass}`} suppressHydrationWarning>
        <button
          onClick={() => router.push("/")}
          className="mb-4 text-sm text-indigo-600 hover:text-indigo-700 underline flex items-center gap-1"
        >
          ← Back to Home
        </button>
        <h1 className="text-3xl font-bold mb-6 text-center">Sign Up</h1>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-2">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className={inputClass}
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium mb-2">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className={inputClass}
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <FaEyeSlash className="w-5 h-5" />
                ) : (
                  <FaEye className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="fullName" className="block text-sm font-medium mb-2">
              Full Name <span className="text-gray-500 text-xs">(optional)</span>
            </label>
            <input
              id="fullName"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className={inputClass}
              placeholder="Enter your full name"
            />
          </div>

          <div>
            <label htmlFor="avatarUrl" className="block text-sm font-medium mb-2">
              Avatar URL <span className="text-gray-500 text-xs">(optional)</span>
            </label>
            <input
              id="avatarUrl"
              type="url"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              className={inputClass}
              placeholder="https://example.com/avatar.jpg"
            />
          </div>

          {error && (
            <div className="p-3 rounded-md bg-red-500/10 border border-red-500/20 text-red-500 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 px-4 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? "Signing up..." : "Sign Up"}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-sm">
            Already have an account?{" "}
            <a href="/auth/login" className="text-indigo-600 hover:text-indigo-700 underline">
              Log in
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
