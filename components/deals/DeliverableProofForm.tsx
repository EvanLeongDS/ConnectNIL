"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  PROOF_MAX_IMAGES,
  PROOF_MIN_DESCRIPTION_LENGTH,
  PROOF_MAX_FILE_BYTES,
  isAllowedProofImageType,
} from "@/lib/deals/deliverableProof";

interface Props {
  dealId: string;
  deliverableId: string;
  deliverableTitle: string;
  successHref: string;
  cancelHref: string;
}

interface ImageFile {
  file: File;
  preview: string;
}

export default function DeliverableProofForm({
  dealId,
  deliverableId,
  deliverableTitle,
  successHref,
  cancelHref,
}: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [description, setDescription] = useState("");
  const [images, setImages] = useState<ImageFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);

  const descLen = description.trim().length;
  const descOk = descLen >= PROOF_MIN_DESCRIPTION_LENGTH;
  const canSubmit = descOk && images.length >= 1 && !loading;

  function addFiles(rawFiles: File[]) {
    const valid: ImageFile[] = [];
    for (const f of rawFiles) {
      if (images.length + valid.length >= PROOF_MAX_IMAGES) break;
      if (!isAllowedProofImageType(f.type)) {
        setError(`"${f.name}" is not a supported image type (JPEG, PNG, WebP, or GIF).`);
        continue;
      }
      if (f.size === 0) {
        setError(`"${f.name}" is empty.`);
        continue;
      }
      if (f.size > PROOF_MAX_FILE_BYTES) {
        setError(`"${f.name}" is larger than 5 MB — please compress or use a different image.`);
        continue;
      }
      const alreadyAdded = images.some((i) => i.file.name === f.name && i.file.size === f.size);
      if (alreadyAdded) continue;
      valid.push({ file: f, preview: URL.createObjectURL(f) });
    }
    setImages((prev) => [...prev, ...valid]);
  }

  function removeImage(index: number) {
    setImages((prev) => {
      URL.revokeObjectURL(prev[index].preview);
      return prev.filter((_, i) => i !== index);
    });
  }

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    addFiles(files);
    e.target.value = "";
  };

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  const onDragLeave = useCallback(() => setDragging(false), []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    // Pass everything through to addFiles so unsupported types get a visible error
    // instead of being silently dropped.
    addFiles(Array.from(e.dataTransfer.files));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!descOk) {
      setError(`Description must be at least ${PROOF_MIN_DESCRIPTION_LENGTH} characters.`);
      return;
    }
    if (images.length === 0) {
      setError("Add at least one image before submitting.");
      return;
    }

    setLoading(true);

    try {
      // 1. Authorize and mint presigned URLs. Tiny JSON round-trip, no image bytes.
      setUploadProgress("Preparing upload...");
      const presignRes = await fetch(
        `/api/deals/${dealId}/deliverables/${deliverableId}/proof-upload-url`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            files: images.map((i) => ({ contentType: i.file.type, size: i.file.size })),
          }),
        }
      );
      const presign = await presignRes.json().catch(() => ({}));
      if (!presignRes.ok) {
        setError(
          typeof presign.error === "string" ? presign.error : "Could not start the upload."
        );
        return;
      }

      // Server reports the S3 driver is off: use the original multipart path unchanged.
      if (presign.mode === "supabase") {
        await legacyMultipartSubmit();
        return;
      }

      // 2. PUT each file straight to S3. The bytes never touch our server, which is the
      //    whole point: the old multipart POST could exceed the platform body cap.
      const uploads: { key: string; url: string; contentType: string }[] =
        presign.uploads ?? [];
      if (uploads.length !== images.length) {
        setError("Could not start the upload. Please reload and try again.");
        return;
      }

      const keys: string[] = new Array(uploads.length);
      let completed = 0;
      const queue = uploads.map((u, i) => async () => {
        // Send ONLY Content-Type. Any additional header that was not part of the
        // signature makes S3 reject the PUT with 403 SignatureDoesNotMatch.
        const putRes = await fetch(u.url, {
          method: "PUT",
          headers: { "Content-Type": u.contentType },
          body: images[i].file,
        });
        if (!putRes.ok) throw new Error(`s3_put_${putRes.status}`);
        keys[i] = u.key;
        completed += 1;
        setUploadProgress(`Uploaded ${completed} of ${uploads.length}...`);
      });

      // Bounded concurrency: parallel enough to feel fast, low enough not to saturate
      // a phone uplink. fetch() has no upload progress events, so the counter above is
      // per-file rather than per-byte.
      const CONCURRENCY = 3;
      const workers = Array.from(
        { length: Math.min(CONCURRENCY, queue.length) },
        async () => {
          for (let job = queue.shift(); job; job = queue.shift()) await job();
        }
      );
      await Promise.all(workers);

      // 3. Commit: description plus the object keys. A few hundred bytes.
      setUploadProgress("Finishing up...");
      const res = await fetch(
        `/api/deals/${dealId}/deliverables/${deliverableId}/submit`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ description: description.trim(), keys }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          typeof data.error === "string" ? data.error : "Submission failed. Please try again."
        );
        return;
      }
      router.push(successHref);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error && err.message.startsWith("s3_put_")
          ? "An image failed to upload. Check your connection and try again."
          : "Network error - please try again."
      );
    } finally {
      setLoading(false);
      setUploadProgress(null);
    }
  }

  /**
   * The pre-S3 submit path. Retained so that flipping PROOF_STORAGE_DRIVER back to
   * "supabase" restores the previous behaviour exactly, with no client deploy.
   */
  async function legacyMultipartSubmit() {
    setUploadProgress(`Uploading ${images.length} image${images.length > 1 ? "s" : ""}...`);
    const fd = new FormData();
    fd.set("description", description.trim());
    images.forEach((img) => fd.append("images", img.file));

    const res = await fetch(
      `/api/deals/${dealId}/deliverables/${deliverableId}/submit`,
      { method: "POST", body: fd }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(
        typeof data.error === "string" ? data.error : "Submission failed. Please try again."
      );
      return;
    }
    router.push(successHref);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">

      {/* ── Description ── */}
      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <label
            htmlFor="proof-description"
            className="text-sm font-semibold text-black dark:text-white"
          >
            What you did
          </label>
          <span
            className={`text-xs font-medium ${
              descLen === 0
                ? "text-black/30 dark:text-white/25"
                : descOk
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-amber-600 dark:text-amber-400"
            }`}
          >
            {descLen} / {PROOF_MIN_DESCRIPTION_LENGTH}
            {descOk && " ✓"}
          </span>
        </div>
        <textarea
          id="proof-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={6}
          placeholder={`Describe how you completed "${deliverableTitle}": what you posted, when, platform(s), any links, hashtags, or other details the brand should review.`}
          className={`w-full rounded-xl border px-4 py-3 text-sm text-black placeholder:text-black/35 focus:outline-none focus:ring-2 dark:text-white dark:placeholder:text-white/30 dark:bg-white/5 transition-colors ${
            descOk
              ? "border-emerald-400 bg-emerald-50/20 focus:border-emerald-500 focus:ring-emerald-500/20 dark:border-emerald-600/50"
              : "border-black/10 bg-white focus:border-[#1f7ae0] focus:ring-[#1f7ae0]/20 dark:border-white/10"
          }`}
        />
        {!descOk && descLen > 0 && (
          <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
            {PROOF_MIN_DESCRIPTION_LENGTH - descLen} more characters needed
          </p>
        )}
        {descOk && (
          <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">
            ✓ Description looks good
          </p>
        )}
      </div>

      {/* ── Image upload ── */}
      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <label className="text-sm font-semibold text-black dark:text-white">
            Proof images
            <span className="ml-1 text-xs font-normal text-black/45 dark:text-white/35">
              (required · up to {PROOF_MAX_IMAGES} · JPEG, PNG, WebP, GIF · max 5 MB each)
            </span>
          </label>
          <span className="text-xs text-black/40 dark:text-white/35">
            {images.length} / {PROOF_MAX_IMAGES}
          </span>
        </div>

        {/* Dropzone */}
        {images.length < PROOF_MAX_IMAGES && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            className={`flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 transition-colors ${
              dragging
                ? "border-[#1f7ae0] bg-[#1f7ae0]/5"
                : "border-black/15 bg-black/2 hover:border-[#1f7ae0]/50 hover:bg-[#1f7ae0]/5 dark:border-white/15 dark:bg-white/3 dark:hover:border-[#1f7ae0]/50"
            }`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-black/30 dark:text-white/25"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
            <div className="text-center">
              <p className="text-sm font-semibold text-black/70 dark:text-white/60">
                {dragging ? "Drop images here" : "Click to select or drag images here"}
              </p>
              <p className="mt-0.5 text-xs text-black/40 dark:text-white/35">
                Screenshots, photos, social media posts, etc.
              </p>
            </div>
          </button>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          onChange={onInputChange}
          className="hidden"
        />

        {/* Thumbnail grid */}
        {images.length > 0 && (
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {images.map((img, i) => (
              <div
                key={img.file.name + img.file.size}
                className="group relative aspect-square overflow-hidden rounded-xl border border-black/8 bg-black/5 dark:border-white/10 dark:bg-white/5"
              >
                <Image
                  src={img.preview}
                  alt={img.file.name}
                  fill
                  className="object-cover"
                  sizes="(max-width: 640px) 50vw, 33vw"
                  unoptimized
                />
                {/* Remove button */}
                <button
                  type="button"
                  onClick={() => removeImage(i)}
                  className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity hover:bg-black/80 group-hover:opacity-100"
                  aria-label="Remove image"
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
                {/* File name tooltip */}
                <div className="absolute bottom-0 left-0 right-0 truncate bg-gradient-to-t from-black/60 to-transparent px-2 pb-1.5 pt-4 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">
                  {img.file.name}
                </div>
              </div>
            ))}

            {/* Add more button inside grid */}
            {images.length < PROOF_MAX_IMAGES && (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="flex aspect-square items-center justify-center rounded-xl border-2 border-dashed border-black/15 bg-black/2 transition-colors hover:border-[#1f7ae0]/50 hover:bg-[#1f7ae0]/5 dark:border-white/15 dark:bg-white/3"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-black/30 dark:text-white/25"
                >
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </button>
            )}
          </div>
        )}

        {images.length === 0 && (
          <p className="mt-1.5 text-xs text-black/40 dark:text-white/35">
            At least 1 image is required. Add screenshots, photos, or recordings of your work.
          </p>
        )}
      </div>

      {/* ── Checklist ── */}
      <div className="rounded-xl border border-black/8 bg-black/2 p-4 dark:border-white/8 dark:bg-white/3">
        <p className="mb-3 text-xs font-bold uppercase tracking-wide text-black/40 dark:text-white/30">
          Before you submit, make sure you have:
        </p>
        <ul className="space-y-2">
          {[
            { done: descOk, text: `Written a clear description (${PROOF_MIN_DESCRIPTION_LENGTH}+ characters)` },
            { done: images.length >= 1, text: "Attached at least one screenshot or photo" },
            { done: true, text: "Included any post URLs, hashtags, or platform tags in your description" },
            { done: true, text: "Completed the deliverable as specified in the deal terms" },
          ].map(({ done, text }, i) => (
            <li key={i} className="flex items-start gap-2.5 text-sm">
              <span
                className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-black ${
                  done
                    ? "bg-emerald-500 text-white dark:bg-emerald-400"
                    : "border border-black/20 text-transparent dark:border-white/20"
                }`}
              >
                ✓
              </span>
              <span className={done ? "text-black/70 dark:text-white/60" : "text-black/40 dark:text-white/30"}>
                {text}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800/50 dark:bg-red-900/20 dark:text-red-300">
          {error}
        </div>
      )}

      {/* ── Upload progress ── */}
      {uploadProgress && (
        <p className="text-sm font-medium text-[#1f7ae0]">{uploadProgress}</p>
      )}

      {/* ── Actions ── */}
      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-xl bg-[#1f7ae0] px-8 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1a6bc9] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              Submitting…
            </span>
          ) : (
            "Submit proof"
          )}
        </button>
        <Link
          href={cancelHref}
          className="inline-flex items-center rounded-xl border border-black/10 px-6 py-3 text-sm font-semibold text-black/60 hover:bg-black/5 dark:border-white/10 dark:text-white/50 dark:hover:bg-white/5"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
