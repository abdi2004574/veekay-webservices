import { MediaPurpose } from '@prisma/client';

export interface MediaPurposeRule {
  contentTypes: string[];
  maxSizeBytes: number;
}

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// Per docs/08-storage.md's allowed-content-types table. `post_media` and
// `story_media` didn't exist in that doc (written before Social Feed) —
// sized/typed the same as the doc's "Chat images" bucket, the closest
// documented analogue for casual user-uploaded photos.
const CHAT_DOCUMENT_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

export const MEDIA_PURPOSE_RULES: Record<MediaPurpose, MediaPurposeRule> = {
  profile_photo: { contentTypes: IMAGE_TYPES, maxSizeBytes: 5 * 1024 * 1024 },
  previous_trip_photo: { contentTypes: IMAGE_TYPES, maxSizeBytes: 5 * 1024 * 1024 },
  post_media: { contentTypes: IMAGE_TYPES, maxSizeBytes: 10 * 1024 * 1024 },
  story_media: { contentTypes: IMAGE_TYPES, maxSizeBytes: 10 * 1024 * 1024 },
  agency_document: {
    contentTypes: ['application/pdf', 'image/jpeg', 'image/png'],
    maxSizeBytes: 20 * 1024 * 1024,
  },
  agency_logo: { contentTypes: IMAGE_TYPES, maxSizeBytes: 5 * 1024 * 1024 },
  chat_image: { contentTypes: IMAGE_TYPES, maxSizeBytes: 10 * 1024 * 1024 },
  chat_document: { contentTypes: CHAT_DOCUMENT_TYPES, maxSizeBytes: 20 * 1024 * 1024 },
  campaign_photo: { contentTypes: IMAGE_TYPES, maxSizeBytes: 10 * 1024 * 1024 },
  // Covers both the itinerary PDF and agency quote/invoice slots — which
  // field references the mediaId (not the purpose) is what distinguishes them.
  campaign_document: { contentTypes: CHAT_DOCUMENT_TYPES, maxSizeBytes: 20 * 1024 * 1024 },
  package_visual: { contentTypes: IMAGE_TYPES, maxSizeBytes: 10 * 1024 * 1024 },
};

const EXT_BY_CONTENT_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
};

export function extensionForContentType(contentType: string): string {
  return EXT_BY_CONTENT_TYPE[contentType] ?? 'bin';
}
