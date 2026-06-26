import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import type { Mock } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (p: string) => `asset://${p}`,
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    close: vi.fn(),
    setTitle: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock("react-zoom-pan-pinch", () => ({
  TransformWrapper: ({ children }: any) => children,
  TransformComponent: ({ children }: any) => children,
}));

// Auto-mock the api module
vi.mock("../../../api");
import * as api from "../../../api";

const {
  getAllPhotos,
  getPreviewImage,
  updatePhotoMeta,
  isTauri,
  openPhotoDetailWindow,
} = api;

import { PhotoDetail } from "../PhotoDetail";
import { useAppStore } from "../../../stores/appStore";

function makePhoto(id: number, overrides: Record<string, unknown> = {}) {
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
    rating: 3,
    colorLabel: "red",
    flag: "pick",
    notes: "测试备注",
    ...overrides,
  };
}

describe("PhotoDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.location.hash = "";
    useAppStore.setState({ photos: [] });
    (isTauri as Mock).mockReturnValue(true);
  });

  it("shows loading state initially", () => {
    (getAllPhotos as Mock).mockResolvedValue([makePhoto(1)]);
    window.location.hash = "#/photo/1";
    const { container } = render(<PhotoDetail />);
    expect(container.textContent).toContain("加载中");
  });

  it("renders photo data after loading", async () => {
    (getAllPhotos as Mock).mockResolvedValue([makePhoto(1)]);
    window.location.hash = "#/photo/1";
    render(<PhotoDetail />);
    expect(await screen.findAllByText("1.jpg", {}, { timeout: 3000 })).toBeTruthy();
  });

  it("renders EXIF camera data", async () => {
    (getAllPhotos as Mock).mockResolvedValue([makePhoto(1)]);
    window.location.hash = "#/photo/1";
    render(<PhotoDetail />);
    expect(await screen.findByText("Canon EOS R5", {}, { timeout: 3000 })).toBeTruthy();
  });

  it("shows edit section", async () => {
    (getAllPhotos as Mock).mockResolvedValue([makePhoto(1, { rating: 4 })]);
    window.location.hash = "#/photo/1";
    render(<PhotoDetail />);
    expect(await screen.findByText("标记与评分", {}, { timeout: 3000 })).toBeTruthy();
  });

  it("shows not-found for invalid photo id", async () => {
    (getAllPhotos as Mock).mockResolvedValue([makePhoto(1)]);
    window.location.hash = "#/photo/999";
    render(<PhotoDetail />);
    expect(await screen.findByText("照片不存在", {}, { timeout: 3000 })).toBeTruthy();
  });
});
