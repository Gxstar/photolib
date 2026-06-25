import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "../appStore";

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
