import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "../appStore";
import type { Photo } from "../../types";

const sample = (id: number): Photo => ({
  id, filePath: `C:/${id}.jpg`, fileName: `${id}.jpg`, fileSize: 0, fileDate: 0,
  mediaType: "jpg", thumbnailUrl: "", thumbnailCachePath: "",
  dateTaken: "", cameraMake: "", cameraModel: "", lensModel: "",
  focalLength: 0, aperture: 0, shutterSpeed: "", iso: 0, exposureComp: 0,
  flash: "", whiteBalance: "", meteringMode: "", imageWidth: 0, imageHeight: 0,
  colorSpace: "", latitude: null, longitude: null, altitude: null,
  software: "", copyright: "", imageDescription: "", orientation: 0,
  exposureProgram: "", maxAperture: 0, focalLength35mm: 0, lensMake: "",
  sceneCaptureType: "", contrast: "", rating: 0, colorLabel: "", flag: "", notes: "",
});

describe("appStore.setPhotos", () => {
  beforeEach(() => {
    useAppStore.setState({ photos: [] });
  });

  it("replaces photos array", () => {
    const photos = [
      {
        id: 1, filePath: "C:/a.jpg", fileName: "a.jpg", fileSize: 100, fileDate: 0,
        mediaType: "jpg", thumbnailUrl: "", thumbnailCachePath: "",
        dateTaken: "", cameraMake: "", cameraModel: "", lensModel: "",
        focalLength: 0, aperture: 0, shutterSpeed: "", iso: 0, exposureComp: 0,
        flash: "", whiteBalance: "", meteringMode: "", imageWidth: 0, imageHeight: 0,
        colorSpace: "", latitude: null, longitude: null, altitude: null,
        software: "", copyright: "", imageDescription: "", orientation: 0,
        exposureProgram: "", maxAperture: 0, focalLength35mm: 0, lensMake: "",
        sceneCaptureType: "", contrast: "", rating: 0, colorLabel: "", flag: "", notes: "",
      },
    ];
    useAppStore.getState().setPhotos(photos);
    expect(useAppStore.getState().photos).toEqual(photos);
  });
});

describe("appStore.patchPhotos", () => {
  beforeEach(() => useAppStore.setState({ photos: [] }));

  it("is a no-op when no patch matches any photo (state reference preserved)", () => {
    const photos = [sample(1), sample(2)];
    useAppStore.setState({ photos });
    const stateBefore = useAppStore.getState();
    useAppStore.getState().patchPhotos([
      { id: 999, filePath: "C:/nope.jpg", dateTaken: "x" },
    ]);
    const stateAfter = useAppStore.getState();
    expect(stateAfter).toBe(stateBefore);                   // same state object
    expect(stateAfter.photos).toBe(stateBefore.photos);     // same array reference
  });

  it("preserves 0 numeric values (uses ?? not ||)", () => {
    useAppStore.setState({ photos: [sample(1)] });
    useAppStore.getState().patchPhotos([{ id: 1, filePath: "C:/1.jpg", iso: 0 }]);
    expect(useAppStore.getState().photos[0].iso).toBe(0);
  });
});
