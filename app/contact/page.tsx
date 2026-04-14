"use client";

import { useState } from "react";
import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";

type Status = "idle" | "loading" | "success" | "error";

const SUBJECTS = [
  "General Inquiry",
  "Partnership Opportunity",
  "Technical Support",
  "Press & Media",
  "Report an Issue",
  "Other",
];

export default function ContactPage() {
  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "" });
  const [errors, setErrors] = useState<Partial<typeof form>>({});
  const [status, setStatus] = useState<Status>("idle");
  const [serverError, setServerError] = useState("");

  function validate() {
    const e: Partial<typeof form> = {};
    if (!form.name.trim())    e.name    = "Name is required.";
    if (!form.email.trim())   e.email   = "Email is required.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = "Enter a valid email.";
    if (!form.subject)        e.subject = "Please select a subject.";
    if (!form.message.trim()) e.message = "Message is required.";
    else if (form.message.trim().length < 10) e.message = "Message must be at least 10 characters.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setStatus("loading");
    setServerError("");

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();

      if (!res.ok) {
        setServerError(data.error ?? "Something went wrong. Please try again.");
        setStatus("error");
      } else {
        setStatus("success");
        setForm({ name: "", email: "", subject: "", message: "" });
      }
    } catch {
      setServerError("Network error. Please check your connection.");
      setStatus("error");
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    if (errors[e.target.name as keyof typeof errors]) {
      setErrors((prev) => ({ ...prev, [e.target.name]: undefined }));
    }
  }

  return (
    <div className="min-h-screen bg-white text-black dark:bg-[#0d1117] dark:text-white">

      {/* ── Navbar ── */}
      <nav className="sticky top-0 z-20 border-b border-black/5 bg-white/90 backdrop-blur dark:border-white/5 dark:bg-[#0d1117]/90">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 md:px-10">
          <Link href="/" className="flex items-center transition hover:opacity-75">
            <img
              src="/connectnil-logo.png"
              alt="ConnectNIL"
              className="h-8 w-auto [mix-blend-mode:multiply] dark:invert dark:[mix-blend-mode:screen]"
            />
          </Link>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link
              href="/login"
              className="rounded-full border border-black/15 px-4 py-1.5 text-sm font-semibold text-black/70 transition hover:bg-black/5 dark:border-white/15 dark:text-white/70 dark:hover:bg-white/8"
            >
              Log in
            </Link>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-2xl px-6 py-16 md:px-10">

        {/* ── Header ── */}
        <div className="mb-10 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#1f7ae0]">Get in Touch</p>
          <h1 className="mt-2 text-4xl font-black tracking-tight">Contact Us</h1>
          <p className="mt-3 text-base leading-7 text-black/55 dark:text-white/50">
            Have a question, partnership idea, or just want to say hi?<br />
            We&apos;ll get back to you within 24 hours.
          </p>
        </div>

        {/* ── Success state ── */}
        {status === "success" ? (
          <div className="rounded-2xl border border-green-100 bg-green-50 px-8 py-12 text-center dark:border-green-900/30 dark:bg-green-900/15">
            <div className="mb-4 text-5xl">✅</div>
            <h2 className="text-xl font-black text-black dark:text-white">Message sent!</h2>
            <p className="mt-2 text-sm text-black/55 dark:text-white/50">
              We&apos;ve received your message and will be in touch at <strong>{form.email || "your email"}</strong> shortly.
            </p>
            <button
              onClick={() => setStatus("idle")}
              className="mt-6 rounded-full bg-[#1f7ae0] px-6 py-2 text-sm font-semibold text-white transition hover:bg-[#1a6bc5]"
            >
              Send another message
            </button>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            noValidate
            className="rounded-2xl border border-black/8 bg-white p-8 shadow-sm dark:border-white/10 dark:bg-[#161b27]"
          >
            {serverError && (
              <div className="mb-6 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-900/30 dark:bg-red-900/15 dark:text-red-400">
                {serverError}
              </div>
            )}

            <div className="grid gap-5 sm:grid-cols-2">
              {/* Name */}
              <Field label="Your name" error={errors.name}>
                <input
                  type="text"
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  placeholder="Jane Smith"
                  className={inputClass(!!errors.name)}
                />
              </Field>

              {/* Email */}
              <Field label="Email address" error={errors.email}>
                <input
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={handleChange}
                  placeholder="jane@example.com"
                  className={inputClass(!!errors.email)}
                />
              </Field>
            </div>

            {/* Subject */}
            <div className="mt-5">
              <Field label="Subject" error={errors.subject}>
                <select
                  name="subject"
                  value={form.subject}
                  onChange={handleChange}
                  className={inputClass(!!errors.subject)}
                  style={{ colorScheme: "inherit" }}
                >
                  <option value="">Select a subject…</option>
                  {SUBJECTS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </Field>
            </div>

            {/* Message */}
            <div className="mt-5">
              <Field label="Message" error={errors.message}>
                <textarea
                  name="message"
                  value={form.message}
                  onChange={handleChange}
                  placeholder="Tell us what's on your mind…"
                  rows={6}
                  className={inputClass(!!errors.message) + " resize-none"}
                />
                <p className="mt-1 text-right text-xs text-black/30 dark:text-white/25">
                  {form.message.length} chars
                </p>
              </Field>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={status === "loading"}
              className="mt-6 w-full rounded-full bg-[#1f7ae0] py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#1a6bc5] disabled:opacity-60"
            >
              {status === "loading" ? "Sending…" : "Send Message →"}
            </button>
          </form>
        )}

        {/* ── Info strip ── */}
        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {[
            { icon: "⚡", label: "Fast replies", desc: "Usually within 24 hours" },
            { icon: "🔒", label: "Private",      desc: "Your info stays with us" },
            { icon: "🤝", label: "Partnerships", desc: "Open to all collaboration" },
          ].map(({ icon, label, desc }) => (
            <div key={label} className="rounded-2xl border border-black/6 bg-white p-5 text-center shadow-sm dark:border-white/10 dark:bg-[#161b27]">
              <div className="mb-2 text-2xl">{icon}</div>
              <p className="text-sm font-semibold text-black dark:text-white">{label}</p>
              <p className="mt-0.5 text-xs text-black/40 dark:text-white/35">{desc}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function inputClass(hasError: boolean) {
  return [
    "w-full rounded-xl border px-4 py-3 text-sm outline-none transition",
    "bg-white text-black placeholder-black/30",
    "dark:bg-[#1c2333] dark:text-white dark:placeholder-white/30",
    hasError
      ? "border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-200 dark:border-red-500 dark:focus:ring-red-900/40"
      : "border-black/10 focus:border-[#1f7ae0] focus:ring-2 focus:ring-[#1f7ae0]/20 dark:border-white/10 dark:focus:border-[#1f7ae0]",
  ].join(" ");
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-semibold text-black/70 dark:text-white/65">
        {label}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-red-500 dark:text-red-400">{error}</p>}
    </div>
  );
}
