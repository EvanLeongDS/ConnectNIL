"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  PROOF_MAX_IMAGES,
  PROOF_MIN_DESCRIPTION_LENGTH,
} from "@/lib/deals/deliverableProof";

interface Props {
  dealId: string;
  deliverableId: string;
  deliverableTitle: string;
  /** Where to go after successful submit */
  successHref: string;
  cancelHref: string;
}

export default function DeliverableProofForm({
  dealId,
  deliverableId,
  deliverableTitle,
  successHref,
  cancelHref,
}: Props) {
  const router = useRouter();
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const descLen = description.trim().length;
  const descOk = descLen >= PROOF_MIN_DESCRIPTION_LENGTH;

  function onFilesChange(e: React.ChangeEvent<HTMLInputElement>) {
    const list = e.target.files ? Array.from(e.target.files) : [];
    setFiles(list.slice(0, PROOF_MAX_IMAGES));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!descOk) {
      setError(`Write at least ${PROOF_MIN_DESCRIPTION_LENGTH} characters describing what you did.`);
      return;
    }
    if (files.length === 0) {
      setError("Add at least one image.");
      return;
    }

    setLoading(true);
    try {
      const fd = new FormData();
      fd.set("description", description.trim());
      files.forEach((f) => fd.append("images", f));

      const res = await fetch(`/api/deals/${dealId}/deliverables/${deliverableId}/submit`, {
        method: "POST",
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Submission failed.");
        return;
      }
      router.push(successHref);
      router.refresh();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label className="mb-2 block text-sm font-semibold text-black dark:text-white">
          Deliverable
        </label>
        <p className="rounded-xl border border-black/8 bg-black/2 px-4 py-3 text-sm text-black/80 dark:border-white/8 dark:bg-white/5 dark:text-white/75">
          {deliverableTitle}
        </p>
      </div>

      <div>
        <label
          htmlFor="proof-description"
          className="mb-2 block text-sm font-semibold text-black dark:text-white"
        >
          What you did (min. {PROOF_MIN_DESCRIPTION_LENGTH} characters)
        </label>
        <textarea
          id="proof-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={8}
          placeholder="Describe how you completed this deliverable: what you posted, when, platforms, links if any, and any other details the brand should verify."
          className="w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-sm text-black placeholder:text-black/35 focus:border-[#1f7ae0] focus:outline-none focus:ring-2 focus:ring-[#1f7ae0]/20 dark:border-white/10 dark:bg-[#161b27] dark:text-white dark:placeholder:text-white/30"
        />
        <p className="mt-1.5 text-xs text-black/45 dark:text-white/40">
          {descLen} / {PROOF_MIN_DESCRIPTION_LENGTH}+ characters
          {!descOk && descLen > 0 && (
            <span className="text-amber-600 dark:text-amber-400"> — keep going</span>
          )}
        </p>
      </div>

      <div>
        <label htmlFor="proof-images" className="mb-2 block text-sm font-semibold text-black dark:text-white">
          Images (1–{PROOF_MAX_IMAGES}, JPEG / PNG / WebP / GIF, max 5 MB each)
        </label>
        <input
          id="proof-images"
          type="file"
          name="images"
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          onChange={onFilesChange}
          className="block w-full text-sm text-black/70 file:mr-4 file:rounded-lg file:border-0 file:bg-[#1f7ae0] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white dark:text-white/60"
        />
        {files.length > 0 && (
          <ul className="mt-2 space-y-1 text-xs text-black/50 dark:text-white/45">
            {files.map((f) => (
              <li key={f.name + f.size}>{f.name}</li>
            ))}
          </ul>
        )}
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800/50 dark:bg-red-900/20 dark:text-red-300">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={loading}
          className="rounded-xl bg-[#1f7ae0] px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#1a6bc9] disabled:opacity-60"
        >
          {loading ? "Submitting…" : "Submit proof"}
        </button>
        <Link
          href={cancelHref}
          className="inline-flex items-center rounded-xl border border-black/10 px-6 py-2.5 text-sm font-semibold text-black/70 hover:bg-black/5 dark:border-white/10 dark:text-white/60 dark:hover:bg-white/5"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
