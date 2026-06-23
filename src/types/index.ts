export interface Photo {
  id: number;
  filePath: string;
  fileName: string;
  fileSize: number;
  mediaType: string;
  thumbnailUrl: string;

  // EXIF core
  dateTaken: string;
  cameraMake: string;
  cameraModel: string;
  lensModel: string;
  focalLength: number;
  aperture: number;
  shutterSpeed: string;
  iso: number;
  exposureComp: number;
  flash: number;
  whiteBalance: string;
  meteringMode: string;
  imageWidth: number;
  imageHeight: number;
  colorSpace: string;

  // GPS
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;

  // Extended EXIF
  software: string;
  copyright: string;
  imageDescription: string;
  orientation: number;
  exposureProgram: string;
  maxAperture: number;
  focalLength35mm: number;
  lensMake: string;
  sceneCaptureType: string;
  contrast: string;

  // User data
  rating: number;       // 0-5
  colorLabel: string;   // '' | 'red' | 'blue' | 'green' | 'yellow' | 'purple'
  flag: string;         // '' | 'pick' | 'reject'
  notes: string;
}

export interface Folder {
  id: number;
  path: string;
  displayName: string;
  photoCount: number;
  lastScan: string;
  children?: Folder[];
}

export interface Collection {
  id: number;
  name: string;
  description: string;
  isSmart: boolean;
  filterJson: string | null;
  createdAt: string;
}

export interface ImportSession {
  id: number;
  sourcePath: string;
  destFolder: string;
  fileCount: number;
  renameRule: string;
  importedAt: string;
}

export interface FilterState {
  cameraModels: string[];
  lensModels: string[];
  focalLengthMin: number;
  focalLengthMax: number;
  apertureMin: number;
  apertureMax: number;
  isoMin: number;
  isoMax: number;
  dateFrom: string;
  dateTo: string;
  ratingMin: number;
  colorLabels: string[];
  flag: string;
  searchText: string;
}

export type ViewMode = 'grid' | 'list' | 'preview' | 'compare';

export interface RenameRule {
  id: string;
  name: string;
  pattern: string;
}

export interface DirectoryEntry {
  path: string;
  name: string;
  photoCount: number;
}

export type LeftPanelTab = 'directory' | 'album';
