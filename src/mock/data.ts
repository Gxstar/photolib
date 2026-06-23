import type { Photo, Folder, RenameRule, Collection } from "../types";

// Generate placeholder thumbnails using colored SVG data URIs
function placeholderThumb(color: string, label: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="213" viewBox="0 0 320 213">
    <rect fill="${color}" width="320" height="213"/>
    <rect fill="rgba(0,0,0,0.15)" x="0" y="0" width="320" height="213"/>
    <text fill="white" font-family="system-ui" font-size="11" x="160" y="106" text-anchor="middle" dominant-baseline="central" opacity="0.8">${label}</text>
  </svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const cameras = [
  { make: "Canon", model: "EOS R5" },
  { make: "Canon", model: "EOS R5" },
  { make: "Canon", model: "EOS R5" },
  { make: "Sony", model: "A7M4" },
  { make: "Sony", model: "A7M4" },
  { make: "Fujifilm", model: "X-T5" },
  { make: "Fujifilm", model: "X-T5" },
  { make: "Nikon", model: "Z8" },
  { make: "Nikon", model: "Z8" },
  { make: "Nikon", model: "Z8" },
  { make: "Canon", model: "EOS R5" },
  { make: "Canon", model: "EOS R5" },
  { make: "Sony", model: "A7M4" },
  { make: "Fujifilm", model: "X-T5" },
  { make: "Nikon", model: "Z8" },
  { make: "Canon", model: "EOS R5" },
  { make: "Sony", model: "A7M4" },
  { make: "Fujifilm", model: "X-T5" },
  { make: "Nikon", model: "Z8" },
  { make: "Canon", model: "EOS R5" },
];

const lenses = [
  "RF 70-200mm f/2.8L IS USM",
  "RF 24-70mm f/2.8L IS USM",
  "RF 50mm f/1.2L USM",
  "FE 24-70mm f/2.8 GM II",
  "FE 70-200mm f/2.8 GM II",
  "XF 23mm f/1.4 R LM WR",
  "XF 56mm f/1.2 R WR",
  "NIKKOR Z 24-70mm f/2.8 S",
  "NIKKOR Z 70-200mm f/2.8 VR S",
  "RF 100-500mm f/4.5-7.1L IS USM",
  "RF 85mm f/1.2L USM",
  "FE 50mm f/1.4 GM",
  "XF 33mm f/1.4 R LM WR",
  "NIKKOR Z 50mm f/1.2 S",
  "RF 15-35mm f/2.8L IS USM",
  "FE 16-35mm f/2.8 GM II",
  "XF 16-55mm f/2.8 R LM WR",
  "NIKKOR Z 14-24mm f/2.8 S",
  "RF 24-105mm f/4L IS USM",
  "FE 85mm f/1.4 GM",
];

const colors = [
  "#4a6741", "#6b8e5a", "#2d5a4b", "#7a9b5e", "#5c7a3e",
  "#8b7355", "#a0845c", "#6d8d94", "#9b7653", "#4a6d7c",
  "#7a6b5c", "#5d7a6b", "#8b6b4e", "#6b5c4a", "#4d6b5c",
  "#9b8b6c", "#5c6b7a", "#8b7a6b", "#6b8a7c", "#7a5b4c",
];

const colorLabels = ["", "red", "blue", "green", "yellow", "purple", "", ""];

export const mockPhotos: Photo[] = cameras.map((cam, i) => ({
  id: i + 1,
  filePath: `D:/Photos/2026/06/photo_${String(i + 1).padStart(4, "0")}.CR3`,
  fileName: `photo_${String(i + 1).padStart(4, "0")}.CR3`,
  fileSize: (25 + Math.random() * 20) * 1024 * 1024,
  mediaType: i % 3 === 0 ? "jpeg" : "raw",
  thumbnailUrl: placeholderThumb(colors[i], `${cam.model} · ${lenses[i].split(" ").slice(0, 2).join(" ")}`),

  dateTaken: `2026-06-${String((i % 15) + 1).padStart(2, "0")}T${String(8 + i % 14).padStart(2, "0")}:${String(i * 3 % 60).padStart(2, "0")}:00`,
  cameraMake: cam.make,
  cameraModel: cam.model,
  lensModel: lenses[i],
  focalLength: [24, 35, 50, 70, 85, 100, 135, 200, 400, 500][i % 10],
  aperture: [1.2, 1.4, 2.0, 2.8, 4.0, 5.6, 8.0, 11, 16, 22][i % 10],
  shutterSpeed: ["1/8000", "1/4000", "1/2000", "1/1000", "1/500", "1/250", "1/125", "1/60", "1/30", "1/15"][i % 10],
  iso: [100, 200, 400, 800, 1600, 3200, 6400, 12800, 25600, 51200][i % 10],
  exposureComp: (i % 5 - 2) * 0.33,
  flash: i % 5 === 0 ? 1 : 0,
  whiteBalance: ["Auto", "Daylight", "Cloudy", "Shade", "Tungsten"][i % 5],
  meteringMode: ["Evaluative", "Center-weighted", "Spot"][i % 3],
  imageWidth: 8192,
  imageHeight: 5464,
  colorSpace: i % 3 === 0 ? "Adobe RGB" : "sRGB",

  latitude: 31.23 + Math.random() * 0.5,
  longitude: 121.47 + Math.random() * 0.5,
  altitude: 4 + Math.random() * 200,

  software: i % 2 === 0 ? "Adobe Lightroom Classic" : "Capture One",
  copyright: i % 8 === 0 ? "© 2026 PhotoLib" : "",
  imageDescription: i % 10 === 0 ? "Test shot" : "",
  orientation: 1,
  exposureProgram: ["手动", "程序自动", "光圈优先", "快门优先"][i % 4],
  maxAperture: [1.4, 2.0, 2.8, 4.0][i % 4],
  focalLength35mm: [24, 35, 50, 70, 85, 100, 135, 200][i % 8],
  lensMake: cam.make,
  sceneCaptureType: ["标准", "风景", "人像"][i % 3],
  contrast: ["标准", "柔和", "锐利"][i % 3],

  rating: Math.floor(Math.random() * 6),
  colorLabel: colorLabels[i % colorLabels.length],
  flag: i % 7 === 0 ? "pick" : i % 11 === 0 ? "reject" : "",
  notes: i % 12 === 0 ? "最佳构图，可做样片" : "",
}));

export const mockFolders: Folder[] = [
  {
    id: 1,
    path: "D:/Photos",
    displayName: "Photos",
    photoCount: 15234,
    lastScan: "2026-06-15T23:00:00",
    children: [
      { id: 2, path: "D:/Photos/2026", displayName: "2026", photoCount: 4321, lastScan: "2026-06-15T23:00:00", children: [
        { id: 3, path: "D:/Photos/2026/06", displayName: "06-六月", photoCount: 847, lastScan: "2026-06-15T23:00:00" },
        { id: 4, path: "D:/Photos/2026/05", displayName: "05-五月", photoCount: 1203, lastScan: "2026-06-15T23:00:00" },
      ]},
      { id: 5, path: "D:/Photos/旅拍-日本", displayName: "旅拍-日本", photoCount: 2340, lastScan: "2026-06-10T00:00:00" },
      { id: 6, path: "D:/Photos/人像", displayName: "人像", photoCount: 890, lastScan: "2026-06-14T00:00:00" },
      { id: 7, path: "D:/Photos/风光", displayName: "风光", photoCount: 2100, lastScan: "2026-06-13T00:00:00" },
    ],
  },
];

export const mockCollections: Collection[] = [
  { id: 1, name: "最佳作品", description: "5星精选", isSmart: true, filterJson: '{"rating":5}', createdAt: "2026-01-15" },
  { id: 2, name: "人像合集", description: "", isSmart: false, filterJson: null, createdAt: "2026-03-20" },
  { id: 3, name: "黑白摄影", description: "黑白作品集", isSmart: false, filterJson: null, createdAt: "2026-04-10" },
];

export const mockRenameRules: RenameRule[] = [
  { id: "date-seq", name: "日期型", pattern: "{datetime}_{seq:3}" },
  { id: "camera-date", name: "机型前缀型", pattern: "{camera_model}_{date}_{seq:4}" },
  { id: "custom-date", name: "自定义前缀型", pattern: "{custom}_{date}_{seq:3}" },
  { id: "original-date", name: "保留原名", pattern: "{original}_{date}" },
  { id: "custom", name: "纯自定义", pattern: "{custom}_{seq:4}" },
];

// 可筛选的相机和镜头列表
export const availableCameraModels = ["Canon EOS R5", "Sony A7M4", "Fujifilm X-T5", "Nikon Z8"];
export const availableLensModels = [
  "RF 70-200mm f/2.8L IS USM",
  "RF 24-70mm f/2.8L IS USM",
  "RF 50mm f/1.2L USM",
  "FE 24-70mm f/2.8 GM II",
  "FE 70-200mm f/2.8 GM II",
  "XF 23mm f/1.4 R LM WR",
  "XF 56mm f/1.2 R WR",
  "NIKKOR Z 24-70mm f/2.8 S",
  "NIKKOR Z 70-200mm f/2.8 VR S",
];
