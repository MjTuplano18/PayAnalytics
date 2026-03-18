"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

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
      {/* Background SVG */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/BKGRD.svg"
        alt=""
        className="pointer-events-none absolute inset-0 h-full w-full object-cover"
      />

      {/* Glassmorphism card */}
      <div className="relative z-10 w-full max-w-[600px] mx-4 rounded-[40px] border border-white/5 bg-[rgba(56,56,56,0.20)] px-8 py-10 sm:px-16 sm:py-14 backdrop-blur-md shadow-2xl">
        {/* Logo SVG centered */}
        <div className="mb-10 flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/SVG%20Lgo.svg"
            alt="PayAnalytics"
            className="h-16 sm:h-20 w-auto"
          />
        </div>

        {/* Error message */}
        {error && (
          <div className="mb-5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-400 text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Email */}
          <div className="space-y-1.5">
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
          <div className="space-y-1.5">
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
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200 transition-colors"
                tabIndex={-1}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          {/* Submit */}
          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-[12px] bg-[#5B66E2] px-8 py-3 text-lg font-normal text-white transition-all hover:bg-[#4B56D2] disabled:opacity-50 shadow-lg"
            >
              {isSubmitting ? "Signing in…" : "Login"}
            </button>
          </div>
        </form>

        {/* Footer */}
        <p className="mt-8 text-center text-base text-[#939393]">
          Contact your administrator for account access
        </p>

        {/* SPMadrid branding */}
        <div className="mt-4 flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/SPMADRID%20WHITE.svg"
            alt="S.P. Madrid"
            className="h-8 w-auto opacity-80"
          />
        </div>
      </div>
    </div>
  );
}
