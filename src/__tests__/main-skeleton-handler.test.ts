import { describe, it, expect } from "vitest";
import { handlePhotosSkeleton, type SkeletonPayload } from "../main-skeleton-handler";

const basePayload = (overrides: Partial<SkeletonPayload> = {}): SkeletonPayload => ({
  folderPath: "C:/photos",
  navId: 1,
  photos: [],
  ...overrides,
});

const photo = (id: number): Record<string, unknown> => ({ id, filePath: `C:/p${id}.jpg` });

describe("handlePhotosSkeleton — navId stale-drop invariant", () => {
  it("(a) higher navId → accept and advance lastNavId", () => {
    const result = handlePhotosSkeleton(
      basePayload({ navId: 5, photos: [photo(1), photo(2)] }),
      "C:/photos",
      3,
    );
    expect(result.accept).toBe(true);
    expect(result.newLastNavId).toBe(5);
    expect(result.photos).toHaveLength(2);
    expect(result.photos[0].id).toBe(1);
  });

  it("(b) lower navId → drop (stale event from a previous selection)", () => {
    const stale = [photo(99)];
    const result = handlePhotosSkeleton(
      basePayload({ navId: 2, photos: stale }),
      "C:/photos",
      5,
    );
    expect(result.accept).toBe(false);
    expect(result.newLastNavId).toBe(5);
    expect(result.photos).toEqual([]);
  });

  it("(c) equal navId → accept (idempotent re-arrival)", () => {
    const result = handlePhotosSkeleton(
      basePayload({ navId: 4, photos: [photo(7)] }),
      "C:/photos",
      4,
    );
    expect(result.accept).toBe(true);
    expect(result.newLastNavId).toBe(4);
    expect(result.photos).toHaveLength(1);
  });

  it("(d) lastNavId only advances on accept", () => {
    const stale = handlePhotosSkeleton(
      basePayload({ navId: 1, photos: [photo(1)] }),
      "C:/photos",
      7,
    );
    expect(stale.accept).toBe(false);
    expect(stale.newLastNavId).toBe(7);

    const accepted = handlePhotosSkeleton(
      basePayload({ navId: 8, photos: [photo(2)] }),
      "C:/photos",
      stale.newLastNavId,
    );
    expect(accepted.accept).toBe(true);
    expect(accepted.newLastNavId).toBe(8);
  });
});

describe("handlePhotosSkeleton — currentDir guard", () => {
  it("drops events for a different folder than the active one", () => {
    const result = handlePhotosSkeleton(
      basePayload({ navId: 99, photos: [photo(1)] }),
      "C:/active",
      0,
    );
    expect(result.accept).toBe(false);
    expect(result.newLastNavId).toBe(0);
    expect(result.photos).toEqual([]);
  });
});
