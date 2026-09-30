/**
 * Server-side verification of an athlete photo key before it is written to the profile.
 * SERVER ONLY — imports lib/aws/s3.ts.
 *
 * The client hands back a key it got from the presign route. That key is not trustworthy on
 * its own: the request body is attacker-controlled, and a presigned PUT only proves that
 * SOMETHING was uploaded, not that it was an image. This mirrors the three-stage commit
 * check in the deliverable submit route.
 *
 * Both save paths (onboarding POST and profile PATCH) go through here, so the rules cannot
 * drift between "set your photo during signup" and "change your photo later" — a split
 * that would otherwise make the editor the weaker of the two.
 */
import {
  deleteAthletePhotoObjects,
  headAthletePhotoObject,
  readObjectPrefix,
} from "@/lib/aws/s3";
import {
  PHOTO_MAX_FILE_BYTES,
  isAllowedPhotoType,
  isValidAthletePhotoKey,
  sniffImageMime,
} from "@/lib/athletes/photo";

export type PhotoCommitResult =
  | { ok: true; key: string }
  | { ok: false; error: string; status: number };

/**
 * Verifies that `key` is a real, in-bounds image uploaded by THIS athlete.
 *
 * `athleteId` must come from the verified server session, never from the request body —
 * it is what stops a caller claiming another athlete's photo object as their own.
 *
 * On any failure the object is deleted: a rejected upload that stays in the bucket is an
 * orphan nothing will ever point at or clean up.
 */
export async function verifyAthletePhotoKey(
  key: string,
  athleteId: string
): Promise<PhotoCommitResult> {
  // 1. Shape and ownership. Cheap, and rejects the whole cross-athlete class before any
  //    network call.
  if (!isValidAthletePhotoKey(key, athleteId)) {
    return { ok: false, error: "That photo could not be verified.", status: 400 };
  }

  // 2. What is ACTUALLY in the bucket. The size and type the client declared at presign
  //    time bound the signature, but HeadObject is what proves the stored object matches.
  const head = await headAthletePhotoObject(key);
  if (!head) {
    // No s3:ListBucket anywhere in this project by design, so a missing key returns 403
    // rather than 404 and headAthletePhotoObject collapses both to null. Do not try to
    // tell them apart here.
    return { ok: false, error: "That photo is no longer available. Please re-upload.", status: 400 };
  }
  if (head.contentLength <= 0 || head.contentLength > PHOTO_MAX_FILE_BYTES) {
    await deleteAthletePhotoObjects([key]);
    return {
      ok: false,
      error: `Your photo must be at most ${Math.round(PHOTO_MAX_FILE_BYTES / 1024 / 1024)} MB.`,
      status: 400,
    };
  }
  if (!isAllowedPhotoType(head.contentType)) {
    await deleteAthletePhotoObjects([key]);
    return { ok: false, error: "Only JPEG, PNG, and WebP images are allowed.", status: 400 };
  }

  // 3. The declared Content-Type is still just a claim — S3 stores whatever header was
  //    signed. Sniff the real leading bytes and require them to agree.
  const head16 = await readObjectPrefix(key, 16);
  const sniffed = head16 ? sniffImageMime(head16) : null;
  if (!sniffed || !isAllowedPhotoType(sniffed) || sniffed !== head.contentType) {
    await deleteAthletePhotoObjects([key]);
    return { ok: false, error: "That file does not look like an image.", status: 400 };
  }

  return { ok: true, key };
}

/**
 * Deletes a photo the profile no longer points at. Best-effort and never throws — losing a
 * cleanup must not fail the athlete's save, which has already succeeded by this point.
 *
 * Call this only AFTER the new key is durably written. Deleting first would, on a failed
 * write, leave the profile pointing at an object that no longer exists.
 */
export async function discardSupersededPhoto(
  previousKey: string | null | undefined,
  newKey: string | null
): Promise<void> {
  if (!previousKey || previousKey === newKey) return;
  await deleteAthletePhotoObjects([previousKey]);
}
