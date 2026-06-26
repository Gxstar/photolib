import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (p: string) => `asset://${p}`,
  invoke: vi.fn(),
}));

vi.mock("../../api", () => ({
  getAlbums: vi.fn(),
  getAllAlbumPhotos: vi.fn(),
  addAlbum: vi.fn(),
  removeAlbum: vi.fn(),
  browseDirectory: vi.fn(),
  openDirectory: vi.fn(),
  isTauri: () => false,
  preloadThumbnails: vi.fn(),
  extractExifFor: vi.fn(),
}));

import { AlbumManager } from "../LeftPanel";

describe("AlbumManager", () => {
  const defaultAlbums = [
    { id: 1, path: "D:/Photos/2025", displayName: "2025", photoCount: 150, lastScan: "" },
    { id: 2, path: "D:/Photos/2024", displayName: "2024", photoCount: 200, lastScan: "" },
  ];

  const defaultProps = {
    albums: defaultAlbums,
    albumExpanded: true,
    onToggleExpand: vi.fn(),
    onAdd: vi.fn(),
    onRemove: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders album header with total photo count", () => {
    render(<AlbumManager {...defaultProps} />);
    expect(screen.getByText("总相册")).toBeTruthy();
    expect(screen.getByText("350 张")).toBeTruthy();
  });

  it("renders directory rows when expanded", () => {
    render(<AlbumManager {...defaultProps} />);
    expect(screen.getByText("2025")).toBeTruthy();
    expect(screen.getByText("2024")).toBeTruthy();
    expect(screen.getByText("150")).toBeTruthy();
    expect(screen.getByText("200")).toBeTruthy();
  });

  it("does not render directory rows when collapsed", () => {
    render(<AlbumManager {...defaultProps} albumExpanded={false} />);
    expect(screen.queryByText("2025")).toBeNull();
    expect(screen.queryByText("2024")).toBeNull();
  });

  it("calls onToggleExpand when album header is clicked", () => {
    const onToggleExpand = vi.fn();
    render(<AlbumManager {...defaultProps} onToggleExpand={onToggleExpand} />);
    fireEvent.click(screen.getByText("总相册"));
    expect(onToggleExpand).toHaveBeenCalledTimes(1);
  });

  it("shows empty state when no albums", () => {
    render(<AlbumManager {...defaultProps} albums={[]} />);
    expect(screen.getByText("还没有添加任何目录")).toBeTruthy();
  });

  it("renders + 添加文件夹 button", () => {
    render(<AlbumManager {...defaultProps} />);
    expect(screen.getByText("添加文件夹")).toBeTruthy();
  });

  it("calls onRemove when delete button is clicked", () => {
    const onRemove = vi.fn();
    const { container } = render(<AlbumManager {...defaultProps} onRemove={onRemove} />);
    const buttons = container.querySelectorAll<HTMLButtonElement>("button");
    const deleteBtn = Array.from(buttons).find(b => b.querySelector("svg"));
    expect(deleteBtn).toBeTruthy();
    if (deleteBtn) {
      fireEvent.click(deleteBtn);
      expect(onRemove).toHaveBeenCalledWith(1, expect.any(Object));
    }
  });

  it("+ 添加文件夹 button calls onAdd", () => {
    const onAdd = vi.fn();
    render(<AlbumManager {...defaultProps} onAdd={onAdd} />);
    const addButtons = screen.getAllByText("添加文件夹");
    fireEvent.click(addButtons[addButtons.length - 1].closest("button")!);
    expect(onAdd).toHaveBeenCalledTimes(1);
  });
});
