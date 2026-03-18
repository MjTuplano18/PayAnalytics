"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import Image from "next/image";

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      await login(email, password);
      toast.success("Welcome back!");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Login failed";
      setError(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gray-950">
      {/* Background image */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/BKGRD.svg"
        alt=""
        className="pointer-events-none absolute inset-0 h-full w-full object-cover"
      />
      <div className="pointer-events-none absolute inset-0 bg-gray-950/40" />

      {/* Glassmorphism card */}
      <div className="relative z-10 w-full max-w-[440px] mx-4 rounded-[40px] border border-white/10 bg-[rgba(30,30,30,0.45)] px-8 py-[52px] sm:px-12 sm:py-[75px] backdrop-blur-sm shadow-2xl flex flex-col">
        {/* Brand Logo */}
        <div className="mb-12 flex justify-center">
          <Image
            src="/SVG Lgo.svg"
            alt="PayAnalytics Logo"
            width={300}
            height={80}
            className="h-auto w-auto max-w-[280px]"
            priority
          />
        </div>

        {/* Error message */}
        {error && (
          <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-5 py-3 text-sm text-red-400 text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Email */}
          <div className="space-y-2">
            <label htmlFor="email" className="text-base text-[#939393]">
              Email
            </label>
            <input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full rounded-[12px] bg-[#ACACAC]/40 px-4 py-3 text-base text-white placeholder:text-gray-500 shadow-[8px_8px_4px_0_rgba(0,0,0,0.25)] outline-none focus:ring-2 focus:ring-teal-400/50 transition-all"
            />
          </div>

          {/* Password */}
          <div className="space-y-2">
            <label htmlFor="password" className="text-base text-[#939393]">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full rounded-[12px] bg-[#ACACAC]/40 px-4 py-3 pr-11 text-base text-white placeholder:text-gray-500 shadow-[8px_8px_4px_0_rgba(0,0,0,0.25)] outline-none focus:ring-2 focus:ring-teal-400/50 transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200 transition-colors"
                tabIndex={-1}
              >
                {showPassword ? (
                  <EyeOff className="h-5 w-5" />
                ) : (
                  <Eye className="h-5 w-5" />
                )}
              </button>
            </div>
          </div>

          {/* Submit */}
          <div className="flex justify-end pt-4">
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-[10px] bg-[#5B66E2] px-6 py-2 text-base font-normal text-white transition-all hover:bg-[#4B56D2] disabled:opacity-50 shadow-lg"
            >
              {isSubmitting ? "Signing in…" : "Login"}
            </button>
          </div>
        </form>

        {/* Footer */}
        <div className="mt-auto pt-10 text-center">
          <p className="text-xs text-[#939393] mb-2">
            Contact your administrator for account access
          </p>
          <div className="flex justify-center">
            <Image
              src="/SPMADRID WHITE.svg"
              alt="S.P. Madrid"
              width={120}
              height={30}
              className="h-auto w-auto max-w-[120px]"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
