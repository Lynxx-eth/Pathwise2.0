// Chat attachments (messaging overhaul Phase 3) — one shared validator and
// serving helper for DMs and study rooms.
//
// Every attachment is content-checked by its leading bytes before storage:
// photos, documents (PDF/DOCX/PPTX) and voice notes recorded in the browser.
// The bytes go to the storage provider; the message row keeps only the key,
// so the GDPR sweep removes them with the account.
import { imageKindFor, kindFor, IMAGE_MIME } from "./parse.js";
import {
  audioKindFor,
  matchesAudioSignature,
  matchesImageSignature,
  matchesSignature,
  AUDIO_MIME,
} from "./fileSignature.js";
import { storage } from "./storage.js";
import { env } from "./env.js";

export type AttachKind = "image" | "file" | "voice";

/** Documents are the biggest thing we accept; voice notes are capped lower
 *  because they're recorded live and shouldn't be able to fill a disk. */
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_VOICE_BYTES = 12 * 1024 * 1024;

export interface ValidatedAttachment {
  kind: AttachKind;
  mime: string;
  /** Filename to store/serve under — sanitized by the storage layer. */
  filename: string;
}

export interface AttachmentRejection {
  status: number;
  error: string;
}

/**
 * Decide what an uploaded chat attachment is, and refuse anything whose
 * bytes don't match its claimed type. Returns either the validated shape or
 * a ready-to-send rejection.
 */
export function validateAttachment(
  filename: string,
  mimeType: string,
  buffer: Buffer
): { ok: true; value: ValidatedAttachment } | { ok: false; reason: AttachmentRejection } {
  const audioKind = audioKindFor(mimeType);
  const imageKind = imageKindFor(filename, mimeType);
  const docKind = kindFor(filename, mimeType);

  // Voice notes first: MediaRecorder blobs arrive with an audio/* type and
  // often no meaningful filename.
  if (audioKind) {
    if (!matchesAudioSignature(audioKind, buffer)) {
      return {
        ok: false,
        reason: { status: 415, error: "That recording didn't arrive as valid audio." },
      };
    }
    if (buffer.byteLength > MAX_VOICE_BYTES) {
      return {
        ok: false,
        reason: { status: 413, error: "Voice notes are capped at 12MB — keep it shorter." },
      };
    }
    return {
      ok: true,
      value: {
        kind: "voice",
        mime: AUDIO_MIME[audioKind],
        filename: `voice.${audioKind === "mpeg" ? "mp3" : audioKind}`,
      },
    };
  }

  if (imageKind) {
    if (!matchesImageSignature(imageKind, buffer)) {
      return {
        ok: false,
        reason: {
          status: 415,
          error: "That image doesn't look like a real photo — it may be renamed or corrupted.",
        },
      };
    }
    if (buffer.byteLength > env.MAX_IMAGE_MB * 1024 * 1024) {
      return {
        ok: false,
        reason: {
          status: 413,
          error: `Photos are capped at ${env.MAX_IMAGE_MB}MB — try a smaller one.`,
        },
      };
    }
    return {
      ok: true,
      value: { kind: "image", mime: IMAGE_MIME[imageKind], filename },
    };
  }

  if (docKind) {
    if (!matchesSignature(docKind, buffer)) {
      return {
        ok: false,
        reason: {
          status: 415,
          error: `That file doesn't look like a real ${docKind.toUpperCase()}.`,
        },
      };
    }
    if (buffer.byteLength > MAX_FILE_BYTES) {
      return {
        ok: false,
        reason: { status: 413, error: "Files are capped at 20MB." },
      };
    }
    return {
      ok: true,
      value: { kind: "file", mime: DOC_MIME[docKind], filename },
    };
  }

  return {
    ok: false,
    reason: {
      status: 415,
      error: "You can send photos, PDF/DOCX/PPTX documents, or a voice note.",
    },
  };
}

const DOC_MIME: Record<"pdf" | "docx" | "pptx", string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

/** Store the bytes and hand back the key for the message row. */
export async function saveAttachment(
  userId: string,
  value: ValidatedAttachment,
  buffer: Buffer
): Promise<{ storagePath: string; sizeBytes: number }> {
  const saved = await storage.save(userId, value.filename, buffer);
  return { storagePath: saved.storagePath, sizeBytes: saved.sizeBytes };
}

/** Public-facing shape for one message's attachment, or null. */
export function attachmentViewOf(
  row: {
    id: string;
    attachPath: string | null;
    attachKind: string | null;
    attachName: string | null;
    attachMime: string | null;
    attachSize: number | null;
    attachSeconds: number | null;
  },
  urlPrefix: string
): {
  kind: AttachKind;
  url: string;
  name: string | null;
  mime: string | null;
  sizeBytes: number | null;
  seconds: number | null;
} | null {
  if (!row.attachPath || !row.attachKind) return null;
  return {
    kind: row.attachKind as AttachKind,
    // Path includes the message id; the route authorizes the viewer.
    url: `${urlPrefix}/${row.id}/attachment`,
    name: row.attachName,
    mime: row.attachMime,
    sizeBytes: row.attachSize,
    seconds: row.attachSeconds,
  };
}
