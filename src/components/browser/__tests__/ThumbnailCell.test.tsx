import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, waitFor } from "@testing-library/react";

// Mock Tauri APIs
vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (p: string) => `asset://${p}`,
  invoke: vi.fn(),
}));

vi.mock("../../../api", () => ({
  getThumbnailPath: vi.fn(),
  isTauri: () => false,
}));

// Virtuoso does not render items in JSDOM without viewport measurements; render all items plainly
vi.mock("react-virtuoso", () => ({
  VirtuosoGrid: ({ totalCount, itemContent, listClassName, computeItemKey }: {
    totalCount: number;
    itemContent: (index: number) => React.ReactNode;
    listClassName?: string;
    computeItemKey?: (index: number) => React.Key;
  }) => {
    const items: React.ReactNode[] = [];
    for (let i = 0; i < totalCount; i++) {
      items.push(
        React.createElement(
          "div",
          { key: computeItemKey ? computeItemKey(i) : i, style: { display: "inline-block" } },
          itemContent(i),
        ),
      );
    }
    return React.createElement("div", { className: listClassName }, items);
  },
}));

import { ThumbnailGrid } from "../ThumbnailGrid";
import { useAppStore } from "../../../stores/appStore";

describe("ThumbnailGrid uses thumbnailCachePath", () => {
  beforeEach(() => {
    useAppStore.setState({ photos: [], selectedIds: new Set() });
  });

  it("renders img with asset URL when cache path provided", async () => {
    const photo = {
      id: 42, filePath: "C:/a.jpg", fileName: "a.jpg",
      fileSize: 0, fileDate: 0, mediaType: "jpg",
      thumbnailUrl: "", thumbnailCachePath: "C:/cache/v7_aaa.jpg",
      dateTaken: "", cameraMake: "", cameraModel: "", lensModel: "",
      focalLength: 0, aperture: 0, shutterSpeed: "", iso: 0, exposureComp: 0,
      flash: "", whiteBalance: "", meteringMode: "", imageWidth: 0, imageHeight: 0,
      colorSpace: "", latitude: null, longitude: null, altitude: null,
      software: "", copyright: "", imageDescription: "", orientation: 0,
      exposureProgram: "", maxAperture: 0, focalLength35mm: 0, lensMake: "",
      sceneCaptureType: "", contrast: "", rating: 0, colorLabel: "", flag: "", notes: "",
    };
    useAppStore.setState({ photos: [photo] });
    const { container } = render(<ThumbnailGrid photos={[photo]} />);
    await waitFor(() => {
      const img = container.querySelector("img");
      expect(img).toBeTruthy();
      expect(img?.getAttribute("src")).toBe("asset://C:/cache/v7_aaa.jpg");
    });
  });
});
