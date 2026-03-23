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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#070D12]">
      {/* Background image */}
      <Image
        src="/BKGRD_ORIGINAL.svg"
        alt=""
        fill
        className="pointer-events-none absolute inset-0 object-cover opacity-60"
        priority
      />
      <div className="pointer-events-none absolute inset-0" />

      {/* Glassmorphism card */}
      <div className="relative z-10 w-full max-w-[440px] mx-4 rounded-[40px] border border-white/5 bg-[rgba(56,56,56,0.20)] px-8 py-10 sm:px-14 sm:py-14 backdrop-blur-md shadow-2xl flex flex-col min-h-[620px]">
        {/* Brand: Logo */}
        <div className="mt-6 mb-10 flex items-center justify-center">
          <Image
            src="/SVG Lgo.svg"
            alt="Logo"
            width={320}
            height={92}
            className="flex-shrink-0"
          />
        </div>

        {/* Error message */}
        {error && (
          <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-5 py-3 text-sm text-red-400 text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-7 mt-8">
          {/* Email */}
          <div className="space-y-1.5">
            <label htmlFor="email" className="text-sm text-[#939393]">
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
              className="w-full rounded-[12px] bg-[#ACACAC]/40 px-4 py-3 text-sm text-white placeholder:text-gray-500 shadow-[8px_8px_4px_0_rgba(0,0,0,0.25)] outline-none focus:ring-2 focus:ring-[#5B66E2]/50 transition-all [&:-webkit-autofill]:[-webkit-box-shadow:0_0_0_1000px_rgba(172,172,172,0.4)_inset] [&:-webkit-autofill]:[-webkit-text-fill-color:white] [&:-webkit-autofill]:[caret-color:white]"
            />
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <label htmlFor="password" className="text-sm text-[#939393]">
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
                className="w-full rounded-[12px] bg-[#ACACAC]/40 px-4 py-3 pr-10 text-sm text-white placeholder:text-gray-500 shadow-[8px_8px_4px_0_rgba(0,0,0,0.25)] outline-none focus:ring-2 focus:ring-[#5B66E2]/50 transition-all [&:-webkit-autofill]:[-webkit-box-shadow:0_0_0_1000px_rgba(172,172,172,0.4)_inset] [&:-webkit-autofill]:[-webkit-text-fill-color:white] [&:-webkit-autofill]:[caret-color:white]"
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
              className="rounded-[10px] bg-[#5B66E2] px-6 py-2 text-sm font-normal text-white transition-all hover:bg-[#4B56D2] disabled:opacity-50 shadow-lg"
            >
              {isSubmitting ? "Signing in…" : "Login"}
            </button>
          </div>
        </form>

        {/* Footer - pushed to bottom */}
        <div className="mt-auto pt-8 flex flex-col items-center gap-3">
          <p className="text-center text-sm text-[#939393]">
            Contact your administrator for account access
          </p>
          <Image
            src="/SPMADRID WHITE.svg"
            alt="SPMADRID"
            width={200}
            height={46}
            className="opacity-90"
          />
        </div>
      </div>
    </div>
  );
}
