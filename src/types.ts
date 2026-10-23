export interface Track {
  id: number;
  file_path: string;
  title: string;
  artist: string;
  album_artist: string;
  album: string;
  genre: string;
  duration: number;
  track_number?: number | null;
}

export interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  targetTrack: Track | null;
}

export interface ScanProgressPayload {
  scanned: number;
  is_finished: boolean;
}

export type ViewMode = "album_artist" | "artist" | "album";
export type MainViewMode = "albums" | "table";
export type SortTarget = "name" | "count";
export type SortOrder = "asc" | "desc";

export interface GroupedAlbum {
  albumTitle: string;
  albumArtist: string;
  tracks: Track[];
  totalDuration: number;
  count: number;
}