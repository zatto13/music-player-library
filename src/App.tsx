import { useState, useEffect, useRef, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Track,
  ContextMenuState,
  ScanProgressPayload,
  ViewMode,
  MainViewMode,
  SortTarget,
  SortOrder,
  GroupedAlbum,
} from "./types";
import HeaderBar from "./components/HeaderBar";
import LeftPane from "./components/LeftPane";
import AlbumView from "./components/AlbumView";
import TableView from "./components/TableView";
import PlayerBar from "./components/PlayerBar";
import ContextMenu from "./components/ContextMenu";
import EditModal from "./components/EditModal";

export default function App() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [folderPath, setFolderPath] = useState("");
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);
  const [volume, setVolume] = useState(1);

  const [isScanning, setIsScanning] = useState(false);
  const [scannedCount, setScannedCount] = useState(0);

  const [viewMode, setViewMode] = useState<ViewMode>("album_artist");
  const [isViewMenuOpen, setIsViewMenuOpen] = useState(false);
  const [mainViewMode, setMainViewMode] = useState<MainViewMode>("albums");

  const [sortTarget, setSortTarget] = useState<SortTarget>("name");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);

  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    targetTrack: null,
  });

  const [isEditing, setIsEditing] = useState(false);
  const [editingTracks, setEditingTracks] = useState<Track[]>([]);
  const [editForm, setEditForm] = useState({
    title: "",
    artist: "",
    album_artist: "",
    album: "",
    genre: "",
  });
  const [isSaving, setIsSaving] = useState(false);

  const parentRef = useRef<HTMLDivElement>(null);

  const loadTracks = async () => {
    try {
      const res = await invoke<Track[]>("get_tracks");
      setTracks(res);
    } catch (err) {
      console.error("Failed to load tracks:", err);
    }
  };

  useEffect(() => {
    loadTracks();

    const unlistenPromise = listen<ScanProgressPayload>("scan-progress", (event) => {
      setScannedCount(event.payload.scanned);
      loadTracks();

      if (event.payload.is_finished) {
        setIsScanning(false);
      }
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  const paneItems = useMemo(() => {
    const counts = new Map<string, number>();
    for (const track of tracks) {
      let name = "";
      if (viewMode === "album_artist") {
        name = track.album_artist || track.artist || "Unknown Album Artist";
      } else if (viewMode === "artist") {
        name = track.artist || "Unknown Artist";
      } else {
        name = track.album || "Unknown Album";
      }
      counts.set(name, (counts.get(name) || 0) + 1);
    }

    const items = Array.from(counts.entries()).map(([name, count]) => ({ name, count }));

    items.sort((a, b) => {
      if (sortTarget === "name") {
        const cmp = a.name.localeCompare(b.name, "ja");
        return sortOrder === "asc" ? cmp : -cmp;
      } else {
        if (a.count !== b.count) {
          return sortOrder === "asc" ? a.count - b.count : b.count - a.count;
        }
        return a.name.localeCompare(b.name, "ja");
      }
    });

    return items;
  }, [tracks, viewMode, sortTarget, sortOrder]);

  useEffect(() => {
    if (paneItems.length > 0) {
      if (!selectedKey || !paneItems.some((item) => item.name === selectedKey)) {
        setSelectedKey(paneItems[0].name);
      }
    } else {
      setSelectedKey(null);
    }
  }, [paneItems, selectedKey]);

  const filteredTracks = useMemo(() => {
    if (!selectedKey) return [];
    return tracks.filter((t) => {
      let val = "";
      if (viewMode === "album_artist") {
        val = t.album_artist || t.artist || "Unknown Album Artist";
      } else if (viewMode === "artist") {
        val = t.artist || "Unknown Artist";
      } else {
        val = t.album || "Unknown Album";
      }
      return val === selectedKey;
    });
  }, [tracks, selectedKey, viewMode]);

  const groupedAlbums = useMemo<GroupedAlbum[]>(() => {
    const map = new Map<string, Track[]>();
    for (const track of filteredTracks) {
      const albumKey = track.album || "Unknown Album";
      if (!map.has(albumKey)) {
        map.set(albumKey, []);
      }
      map.get(albumKey)!.push(track);
    }

    return Array.from(map.entries()).map(([albumTitle, albumTracks]) => {
      albumTracks.sort((a, b) => {
        if (a.track_number && b.track_number) return a.track_number - b.track_number;
        return a.title.localeCompare(b.title, "ja");
      });

      const totalDuration = albumTracks.reduce((acc, cur) => acc + cur.duration, 0);
      const albumArtist = albumTracks[0]?.album_artist || albumTracks[0]?.artist || "Unknown Artist";

      return {
        albumTitle,
        albumArtist,
        tracks: albumTracks,
        totalDuration,
        count: albumTracks.length,
      };
    });
  }, [filteredTracks]);

  useEffect(() => {
    if (!isPlaying || isSeeking) return;
    const interval = setInterval(async () => {
      try {
        const pos = await invoke<number>("get_playback_position");
        setCurrentTime(pos);
      } catch (err) {
        console.error("Failed to get playback position:", err);
      }
    }, 250);
    return () => clearInterval(interval);
  }, [isPlaying, isSeeking]);

  useEffect(() => {
    const handleClickOutside = () => {
      if (contextMenu.visible) setContextMenu((prev) => ({ ...prev, visible: false }));
      if (isViewMenuOpen) setIsViewMenuOpen(false);
    };
    window.addEventListener("click", handleClickOutside);
    return () => window.removeEventListener("click", handleClickOutside);
  }, [contextMenu.visible, isViewMenuOpen]);

  const rowVirtualizer = useVirtualizer({
    count: filteredTracks.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 28,
    overscan: 15,
  });

  const handleScan = async () => {
    if (!folderPath) return;
    setIsScanning(true);
    setScannedCount(0);
    try {
      await invoke("start_scan_directory", { dirPath: folderPath });
    } catch (err) {
      alert(`スキャンエラー: ${err}`);
      setIsScanning(false);
    }
  };

  const handlePlay = async (track: Track) => {
    try {
      await invoke("play_track", { filePath: track.file_path });
      setCurrentTrack(track);
      setIsPlaying(true);
      setCurrentTime(0);
    } catch (err) {
      console.error("Playback error:", err);
    }
  };

  const handleTogglePlayPause = async () => {
    if (!currentTrack) {
      if (filteredTracks.length > 0) handlePlay(filteredTracks[0]);
      return;
    }
    try {
      const playing = await invoke<boolean>("toggle_play_pause");
      setIsPlaying(playing);
    } catch (err) {
      console.error("Toggle play/pause error:", err);
    }
  };

  const handleRowClick = (e: React.MouseEvent, index: number, track: Track) => {
    if (e.shiftKey && lastSelectedIndex !== null) {
      const start = Math.min(lastSelectedIndex, index);
      const end = Math.max(lastSelectedIndex, index);
      const nextSelected = new Set(selectedIds);
      for (let i = start; i <= end; i++) nextSelected.add(filteredTracks[i].id);
      setSelectedIds(nextSelected);
    } else if (e.ctrlKey || e.metaKey) {
      const nextSelected = new Set(selectedIds);
      if (nextSelected.has(track.id)) nextSelected.delete(track.id);
      else nextSelected.add(track.id);
      setSelectedIds(nextSelected);
      setLastSelectedIndex(index);
    } else {
      setSelectedIds(new Set([track.id]));
      setLastSelectedIndex(index);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, index: number, track: Track) => {
    e.preventDefault();
    if (!selectedIds.has(track.id)) {
      setSelectedIds(new Set([track.id]));
      setLastSelectedIndex(index);
    }
    setContextMenu({ visible: true, x: e.clientX, y: e.clientY, targetTrack: track });
  };

  const handleDeleteFromMenu = async () => {
    const targetIds = Array.from(selectedIds);
    if (targetIds.length === 0 && contextMenu.targetTrack) targetIds.push(contextMenu.targetTrack.id);
    setContextMenu((prev) => ({ ...prev, visible: false }));

    const confirmMsg =
      targetIds.length === 1
        ? `「${contextMenu.targetTrack?.title || "選択した曲"}」をライブラリから削除しますか？\n(※実ファイルは削除されません)`
        : `選択中の ${targetIds.length} 曲をライブラリから削除しますか？\n(※実ファイルは削除されません)`;

    if (!window.confirm(confirmMsg)) return;

    try {
      for (const id of targetIds) await invoke("delete_track", { id });
      const targetSet = new Set(targetIds);
      setTracks((prev) => prev.filter((t) => !targetSet.has(t.id)));
      setSelectedIds(new Set());
      setLastSelectedIndex(null);

      if (currentTrack && targetSet.has(currentTrack.id)) {
        setIsPlaying(false);
        setCurrentTrack(null);
        setCurrentTime(0);
      }
    } catch (err) {
      console.error("Delete error:", err);
    }
  };

  const handleOpenEditModal = () => {
    setContextMenu((prev) => ({ ...prev, visible: false }));
    const targetList = filteredTracks.filter((t) => selectedIds.has(t.id));
    if (targetList.length === 0 && contextMenu.targetTrack) targetList.push(contextMenu.targetTrack);
    if (targetList.length === 0) return;

    setEditingTracks(targetList);

    if (targetList.length === 1) {
      setEditForm({
        title: targetList[0].title,
        artist: targetList[0].artist,
        album_artist: targetList[0].album_artist,
        album: targetList[0].album,
        genre: targetList[0].genre,
      });
    } else {
      const firstArtist = targetList[0].artist;
      const firstAlbumArtist = targetList[0].album_artist;
      const firstAlbum = targetList[0].album;
      const firstGenre = targetList[0].genre;
      setEditForm({
        title: "",
        artist: targetList.every((t) => t.artist === firstArtist) ? firstArtist : "",
        album_artist: targetList.every((t) => t.album_artist === firstAlbumArtist) ? firstAlbumArtist : "",
        album: targetList.every((t) => t.album === firstAlbum) ? firstAlbum : "",
        genre: targetList.every((t) => t.genre === firstGenre) ? firstGenre : "",
      });
    }
    setIsEditing(true);
  };

  const handleSaveTags = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingTracks.length === 0) return;
    setIsSaving(true);

    try {
      const isMulti = editingTracks.length > 1;
      for (const track of editingTracks) {
        await invoke("update_track_tags", {
          id: track.id,
          filePath: track.file_path,
          title: isMulti ? track.title : (editForm.title || track.title),
          artist: editForm.artist.trim() !== "" ? editForm.artist : track.artist,
          albumArtist: editForm.album_artist.trim() !== "" ? editForm.album_artist : track.album_artist,
          album: editForm.album.trim() !== "" ? editForm.album : track.album,
          genre: editForm.genre.trim() !== "" ? editForm.genre : track.genre,
        });
      }
      await loadTracks();
      setIsEditing(false);
      setEditingTracks([]);
    } catch (err) {
      alert(`保存エラー: ${err}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsSeeking(true);
    setCurrentTime(parseFloat(e.target.value));
  };

  const handleSeekCommit = async () => {
    try {
      await invoke("seek_track", { positionSecs: currentTime });
    } catch (err) {
      console.error("Seek error:", err);
    } finally {
      setIsSeeking(false);
    }
  };

  const handleVolumeChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    try {
      await invoke("set_volume", { volume: val });
    } catch (err) {
      console.error("Set volume error:", err);
    }
  };

  // ヘルパー関数
  const getPrimaryGenre = (genreStr: string) => {
    if (!genreStr) return "";
    return genreStr.split(/[;；]/)[0]?.trim() || "";
  };

  const formatDuration = (sec: number) => {
    const total = Math.floor(sec);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div
      style={{
        height: "100vh",
        width: "100vw",
        display: "flex",
        flexDirection: "column",
        fontFamily: "Segoe UI, sans-serif",
        background: "#1e1e1e",
        color: "#ddd",
        overflow: "hidden",
      }}
    >
      {/* 1. 上部操作バー */}
      <HeaderBar
        folderPath={folderPath}
        setFolderPath={setFolderPath}
        isScanning={isScanning}
        scannedCount={scannedCount}
        handleScan={handleScan}
        mainViewMode={mainViewMode}
        setMainViewMode={setMainViewMode}
        selectedKey={selectedKey}
        filteredCount={filteredTracks.length}
        selectedCount={selectedIds.size}
      />

      {/* 2. メイン領域（左ペイン ＋ 右ビュー） */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", overflow: "hidden", width: "100%" }}>
        <LeftPane
          viewMode={viewMode}
          setViewMode={setViewMode}
          isViewMenuOpen={isViewMenuOpen}
          setIsViewMenuOpen={setIsViewMenuOpen}
          sortTarget={sortTarget}
          setSortTarget={setSortTarget}
          sortOrder={sortOrder}
          setSortOrder={setSortOrder}
          paneItems={paneItems}
          selectedKey={selectedKey}
          setSelectedKey={setSelectedKey}
          clearSelection={() => {
            setSelectedIds(new Set());
            setLastSelectedIndex(null);
          }}
        />

        {mainViewMode === "albums" ? (
          <AlbumView
            groupedAlbums={groupedAlbums}
            filteredTracks={filteredTracks}
            currentTrack={currentTrack}
            isPlaying={isPlaying}
            selectedIds={selectedIds}
            handleRowClick={handleRowClick}
            handlePlay={handlePlay}
            handleContextMenu={handleContextMenu}
            formatDuration={formatDuration}
          />
        ) : (
          <TableView
            parentRef={parentRef}
            rowVirtualizer={rowVirtualizer}
            filteredTracks={filteredTracks}
            currentTrack={currentTrack}
            isPlaying={isPlaying}
            selectedIds={selectedIds}
            handleRowClick={handleRowClick}
            handlePlay={handlePlay}
            handleContextMenu={handleContextMenu}
            getPrimaryGenre={getPrimaryGenre}
            formatDuration={formatDuration}
          />
        )}
      </div>

      {/* 3. 再生バー */}
      <PlayerBar
        currentTrack={currentTrack}
        isPlaying={isPlaying}
        handleTogglePlayPause={handleTogglePlayPause}
        volume={volume}
        handleVolumeChange={handleVolumeChange}
        currentTime={currentTime}
        handleSeekChange={handleSeekChange}
        handleSeekCommit={handleSeekCommit}
        formatDuration={formatDuration}
      />

      {/* 4. モーダル & 右クリックメニュー */}
      <ContextMenu
        contextMenu={contextMenu}
        selectedIds={selectedIds}
        handlePlay={handlePlay}
        handleOpenEditModal={handleOpenEditModal}
        handleDeleteFromMenu={handleDeleteFromMenu}
        closeMenu={() => setContextMenu((prev) => ({ ...prev, visible: false }))}
      />

      <EditModal
        isEditing={isEditing}
        editingTracks={editingTracks}
        editForm={editForm}
        setEditForm={setEditForm}
        isSaving={isSaving}
        handleSaveTags={handleSaveTags}
        closeModal={() => setIsEditing(false)}
      />
    </div>
  );
}