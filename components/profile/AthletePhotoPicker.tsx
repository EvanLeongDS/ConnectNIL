"use client";

import { useEffect, useRef, useState } from "react";
import {
  PHOTO_ACCEPT_ATTR,
  PHOTO_MAX_FILE_BYTES,
  initialsFor,
  isAllowedPhotoType,
} from "@/lib/athletes/photo";

/**
 * Athlete profile photo picker. Used by BOTH the onboarding wizard and the profile editor,
 * so the upload rules cannot drift between "set it at signup" and "change it later".
 *
 * Uploads straight to S3 through a presigned PUT — the bytes never transit our server. The
 * parent is handed only the resulting object KEY and saves it with the rest of the form;
 * this component never writes to the database itself. That split is what lets the same
 * component sit inside a wizard that submits once at the end and inside an editor that
 * PATCHes immediately.
 *
 * NOTE every button here is type="button". The onboarding wizard's Continue/Submit buttons
 * are type="submit" and the form dispatches on `step === N`, so a bare <button> inside it
 * advances or submits the whole wizard when clicked.
 */

type Props = {
  /** Current photo key, or null. Controlled by the parent. */
  value: string | null;
  /** Presigned URL of the ALREADY-SAVED photo, for the editor. Ignored once a new file is picked. */
  savedUrl?: string | null;
  onChange: (key: string | null) => void;
  /** Lets the parent disable its submit button while an upload is in flight. */
  onBusyChange?: (busy: boolean) => void;
  firstName?: string;
  lastName?: string;
  /** Rendered under the control. */
  hint?: string;
};

export default function AthletePhotoPicker({
  value,
  savedUrl,
  onChange,
  onBusyChange,
  firstName,
  lastName,
  hint,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Set when the server reports S3 is not configured — the photo step becomes optional-and-skipped. */
  const [unavailable, setUnavailable] = useState(false);

  // Object URLs are a real leak if not revoked; the cleanup runs on replace and unmount.
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function setBusyBoth(next: boolean) {
    setBusy(next);
    onBusyChange?.(next);
  }

  async function handleFile(file: File) {
    setError(null);

    // Validate before spending a presign round-trip. The server re-checks all of this, and
    // then checks the stored object's real bytes — this is purely to fail fast.
    if (!isAllowedPhotoType(file.type)) {
      setError("Please choose a JPEG, PNG, or WebP image.");
      return;
    }
    if (file.size <= 0 || file.size > PHOTO_MAX_FILE_BYTES) {
      setError(`Your photo must be at most ${Math.round(PHOTO_MAX_FILE_BYTES / 1024 / 1024)} MB.`);
      return;
    }

    setBusyBoth(true);
    try {
      const presignRes = await fetch("/api/profile/athlete/photo-upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentType: file.type, size: file.size }),
      });
      const presign = await presignRes.json().catch(() => ({}));

      if (!presignRes.ok) {
        setError(typeof presign.error === "string" ? presign.error : "Could not start the upload.");
        return;
      }
      if (presign.mode === "unavailable") {
        // Photo storage is not configured in this environment. Say so plainly instead of
        // failing the athlete's signup over it.
        setUnavailable(true);
        return;
      }

      let putRes: Response;
      try {
        putRes = await fetch(presign.url, {
          method: "PUT",
          // Content-Type ONLY. The presigned signature covers exactly host, content-type and
          // content-length; adding any other header makes S3 answer 403 SignatureDoesNotMatch,
          // and the bucket's CORS AllowedHeaders is ["Content-Type"] to match.
          headers: { "Content-Type": file.type },
          body: file,
        });
      } catch {
        // A CORS rejection and being offline both surface as TypeError. Our own origin
        // answered the presign a moment ago, so connectivity is not the explanation.
        throw new Error(navigator.onLine ? "s3_blocked" : "offline");
      }
      if (!putRes.ok) throw new Error(`s3_put_${putRes.status}`);

      if (preview) URL.revokeObjectURL(preview);
      setPreview(URL.createObjectURL(file));
      onChange(presign.key);
    } catch (err) {
      setError(uploadErrorMessage(err));
    } finally {
      setBusyBoth(false);
      // Let the same file be re-picked after a failure; without this, choosing the identical
      // file fires no change event and the control looks dead.
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function uploadErrorMessage(err: unknown): string {
    const code = err instanceof Error ? err.message : "";
    if (code === "s3_blocked") {
      return "The upload was blocked before it reached storage. That is a configuration problem on our side, not your connection — please contact support and mention code PHOTO-CORS.";
    }
    if (code === "offline") return "You appear to be offline. Reconnect and try again.";
    if (code === "s3_put_403") {
      /* Deliberately NOT the proof form's "the upload link expired". A 403 on this prefix is
         far more likely to be the IAM policy: `athletes/*` has to be granted explicitly in
         infra/lib/foundation-stack.ts, and until that stack is redeployed EVERY upload here
         403s. Presigning is local HMAC with no AWS call, so the link itself looks perfectly
         valid and "expired" sends people into an unwinnable retry loop. */
      return "Storage refused the upload. If this keeps happening it is a permissions problem on our side — please contact support and mention code PHOTO-403.";
    }
    if (code.startsWith("s3_put_")) {
      return "Your photo failed to upload. Check your connection and try again.";
    }
    return "Something went wrong uploading your photo. Please try again.";
  }

  function handleRemove() {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setError(null);
    onChange(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  const shownUrl = preview ?? (value ? savedUrl ?? null : null);
  const hasPhoto = Boolean(value);

  if (unavailable) {
    return (
      <div className="rounded-xl border border-dashed border-black/10 bg-black/[0.02] p-4 text-sm text-black/45 dark:border-white/10 dark:bg-white/[0.02] dark:text-white/40">
        Photo uploads aren&apos;t available in this environment. You can add a photo later
        from your profile.
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-5">
        <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-full border border-black/8 bg-[#f9fafb] dark:border-white/12 dark:bg-[#222833]">
          {shownUrl ? (
            /* A blob: URL for the local preview and a presigned S3 URL for the saved photo.
               next/image cannot take a blob:, and the two swap freely here, so this stays a
               plain <img>. The rendered box is 96px — there is no optimisation worth the
               branch. */
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shownUrl} alt="Your profile photo" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-2xl font-black text-black/25 dark:text-white/20">
              {initialsFor(firstName, lastName)}
            </div>
          )}
          {busy && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-[11px] font-semibold text-white">
              Uploading…
            </div>
          )}
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              className="rounded-lg bg-[#1f7ae0] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#1a68c0] disabled:opacity-50"
            >
              {hasPhoto ? "Change photo" : "Upload photo"}
            </button>
            {hasPhoto && (
              <button
                type="button"
                onClick={handleRemove}
                disabled={busy}
                className="rounded-lg border border-black/10 px-4 py-2 text-sm font-semibold text-black/60 transition hover:bg-black/[0.03] disabled:opacity-50 dark:border-white/12 dark:text-white/55 dark:hover:bg-white/[0.03]"
              >
                Remove
              </button>
            )}
          </div>
          <p className="mt-2 text-xs text-black/40 dark:text-white/30">
            {hint ?? `JPEG, PNG, or WebP · up to ${Math.round(PHOTO_MAX_FILE_BYTES / 1024 / 1024)} MB`}
          </p>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={PHOTO_ACCEPT_ATTR}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />

      {error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/25 dark:text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
