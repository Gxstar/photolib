import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (p: string) => `asset://${p}`,
}));

vi.mock("../../api", () => ({
  getPreviewImage: vi.fn().mockResolvedValue("C:/cache/v7_l2.jpg"),
  isTauri: () => false,
}));

vi.mock("yet-another-react-lightbox", () => ({
  __esModule: true,
  default: ({ open, slides, index, children }: any) =>
    open ? (
      <div data-testid="lightbox" data-index={index}>
        {children}
        {slides?.map((s: any, i: number) => (
          <div key={i} data-testid="slide" data-src={s.src} data-index={i} />
        ))}
      </div>
    ) : null,
}));

vi.mock("yet-another-react-lightbox/plugins/zoom", () => ({ default: {} }));
vi.mock("yet-another-react-lightbox/plugins/fullscreen", () => ({ default: {} }));
vi.mock("yet-another-react-lightbox/plugins/counter", () => ({ default: {} }));
vi.mock("yet-another-react-lightbox/plugins/thumbnails", () => ({ default: {} }));
vi.mock("yet-another-react-lightbox/plugins/slideshow", () => ({ default: {} }));

import { PhotoPreview } from "../PhotoPreview";
import { useAppStore } from "../../../stores/appStore";

function makePhoto(id: number, overrides: Record<string, unknown> = {}): any {
  return {
    id,
    filePath: `C:/photos/${id}.jpg`,
    fileName: `${id}.jpg`,
    fileSize: 1000,
    fileDate: 0,
    mediaType: "jpg",
    thumbnailUrl: "",
    thumbnailCachePath: "",
    dateTaken: "2024-01-15",
    cameraMake: "Canon",
    cameraModel: "EOS R5",
    lensModel: "RF 24-70mm f/2.8",
    focalLength: 50,
    aperture: 2.8,
    shutterSpeed: "1/250",
    iso: 400,
    exposureComp: 0,
    flash: "",
    whiteBalance: "Auto",
    meteringMode: "Evaluative",
    imageWidth: 6720,
    imageHeight: 4480,
    colorSpace: "sRGB",
    latitude: null,
    longitude: null,
    altitude: null,
    software: "",
    copyright: "",
    imageDescription: "",
    orientation: 0,
    exposureProgram: "",
    maxAperture: 0,
    focalLength35mm: 0,
    lensMake: "",
    sceneCaptureType: "",
    contrast: "",
    rating: 0,
    colorLabel: "",
    flag: "",
    notes: "",
    ...overrides,
  };
}

describe("PhotoPreview", () => {
  beforeEach(() => {
    useAppStore.setState({ previewPhotoId: null });
  });

  it("renders nothing when previewPhotoId is null", () => {
    const { container } = render(
      <PhotoPreview photos={[]} onClose={() => {}} />,
    );
    expect(container.querySelector("[data-testid='lightbox']")).toBeNull();
  });

  it("renders Lightbox when previewPhotoId is set", () => {
    useAppStore.setState({ previewPhotoId: 1 });
    const photos = [makePhoto(1), makePhoto(2)];
    render(<PhotoPreview photos={photos} onClose={() => {}} />);
    expect(screen.getByTestId("lightbox")).toBeTruthy();
  });

  it("shows EXIF panel with correct photo data", () => {
    useAppStore.setState({ previewPhotoId: 1 });
    const photos = [makePhoto(1, { cameraMake: "Nikon", cameraModel: "Z8" })];
    render(<PhotoPreview photos={photos} onClose={() => {}} />);
    expect(screen.getByText("Nikon Z8")).toBeTruthy();
    expect(screen.getByText("f/2.8")).toBeTruthy();
    expect(screen.getByText("6720 × 4480")).toBeTruthy();
  });

  it("toggles EXIF panel when I key is pressed", () => {
    useAppStore.setState({ previewPhotoId: 1 });
    const photos = [makePhoto(1)];
    render(<PhotoPreview photos={photos} onClose={() => {}} />);
    expect(screen.getByText("EXIF 信息")).toBeTruthy();
    fireEvent.keyDown(window, { key: "i" });
    expect(screen.queryByText("EXIF 信息")).toBeNull();
    fireEvent.keyDown(window, { key: "i" });
    expect(screen.getByText("EXIF 信息")).toBeTruthy();
  });

  it("auto-closes when photoId leaves the filtered list", () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <PhotoPreview photos={[makePhoto(1), makePhoto(2)]} onClose={onClose} />,
    );
    // No photoId set → nothing happens
    expect(onClose).not.toHaveBeenCalled();

    // Set photoId, then render with a filtered list that doesn't include it
    useAppStore.setState({ previewPhotoId: 1 });
    rerender(
      <PhotoPreview photos={[makePhoto(2)]} onClose={onClose} />,
    );
    // Should auto-close → onClose not called directly, but previewPhotoId cleared
    // Which means the component returns null
    expect(screen.queryByTestId("lightbox")).toBeNull();
  });
});
