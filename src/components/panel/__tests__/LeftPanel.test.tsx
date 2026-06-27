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
    selectedId: null,
    onSelect: vi.fn(),
    onToggleExpand: vi.fn(),
    onAdd: vi.fn(),
    onRemove: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders album header and show-all row", () => {
    render(<AlbumManager {...defaultProps} />);
    expect(screen.getByText("相册")).toBeTruthy();
    expect(screen.getByText("全部相册")).toBeTruthy();
    expect(screen.getByText("350")).toBeTruthy();
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
    expect(screen.queryByText("全部相册")).toBeNull();
  });

  it("calls onToggleExpand when album header is clicked", () => {
    const onToggleExpand = vi.fn();
    render(<AlbumManager {...defaultProps} onToggleExpand={onToggleExpand} />);
    fireEvent.click(screen.getByText("相册"));
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

  it("calls onSelect(null) when 全部相册 is clicked", () => {
    const onSelect = vi.fn();
    render(<AlbumManager {...defaultProps} onSelect={onSelect} />);
    fireEvent.click(screen.getByText("全部相册"));
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it("calls onSelect with album id when a directory row is clicked", () => {
    const onSelect = vi.fn();
    render(<AlbumManager {...defaultProps} onSelect={onSelect} />);
    fireEvent.click(screen.getByText("2025"));
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it("applies selected styles to 全部相册 when selectedId is null", () => {
    const { container } = render(<AlbumManager {...defaultProps} selectedId={null} />);
    const rows = container.querySelectorAll<HTMLDivElement>(".flex.items-center.gap-2\\.5");
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]?.className).toContain("bg-accent-500/10");
  });

  it("applies selected styles to a folder row when selectedId matches", () => {
    const { container } = render(<AlbumManager {...defaultProps} selectedId={1} />);
    const rows = container.querySelectorAll<HTMLDivElement>(".flex.items-center.gap-2\\.5");
    expect(rows.length).toBeGreaterThan(1);
    expect(rows[0]?.className).not.toContain("bg-accent-500/10");
    expect(rows[1]?.className).toContain("bg-accent-500/10");
  });
});
