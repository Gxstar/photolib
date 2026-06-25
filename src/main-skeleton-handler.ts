// Pure handler for the "photos-skeleton" event payload.
// Extracted from main.tsx so it can be unit-tested in isolation.
//
// Invariant (P0.5 stale-drop):
//   A skeleton event is only accepted if its navId is >= lastNavId.
//   `lastNavId` advances ONLY when we accept a payload, so a late
//   arrival from a stale selection cannot overwrite a newer one.

export interface SkeletonPayload {
  folderPath: string;
  navId: number;
  photos: Record<string, unknown>[];
}

export interface SkeletonDecision {
  accept: boolean;
  newLastNavId: number;
  photos: Record<string, unknown>[];
}

export function handlePhotosSkeleton(
  payload: SkeletonPayload,
  currentDir: string,
  lastNavId: number,
): SkeletonDecision {
  if (payload.folderPath !== currentDir) {
    return { accept: false, newLastNavId: lastNavId, photos: [] };
  }
  if (payload.navId < lastNavId) {
    return { accept: false, newLastNavId: lastNavId, photos: [] };
  }
  return {
    accept: true,
    newLastNavId: payload.navId,
    photos: payload.photos,
  };
}
