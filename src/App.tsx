import { useState, useEffect, useRef, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useVirtualizer } from "@tanstack/react-virtual";

interface Track {
  id: number;
  file_path: string;
  title: string;
  artist: string;
  album: string;
  genre: string;
  duration: number;
}

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  targetTrack: Track | null;
}

export default function App() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [folderPath, setFolderPath] = useState("");
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isScanning, setIsScanning] = useState(false);

  // 選択管理
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);

  // 選択中のアーティスト
  const [selectedArtist, setSelectedArtist] = useState<string | null>(null);

  // 右クリックメニュー
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    targetTrack: null,
  });

  // タグ編集モーダル用
  const [isEditing, setIsEditing] = useState(false);
  const [editingTracks, setEditingTracks] = useState<Track[]>([]);
  const [editForm, setEditForm] = useState({ title: "", artist: "", album: "", genre: "" });
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
  }, []);

  // アーティスト一覧の集計
  const artistList = useMemo(() => {
    const counts = new Map<string, number>();
    for (const track of tracks) {
      const artist = track.artist || "Unknown Artist";
      counts.set(artist, (counts.get(artist) || 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name, "ja"));
  }, [tracks]);

  // 先頭アーティスト自動選択
  useEffect(() => {
    if (artistList.length > 0) {
      if (!selectedArtist || !artistList.some((a) => a.name === selectedArtist)) {
        setSelectedArtist(artistList[0].name);
      }
    } else {
      setSelectedArtist(null);
    }
  }, [artistList, selectedArtist]);

  // 絞り込み済みトラック
  const filteredTracks = useMemo(() => {
    if (!selectedArtist) return [];
    return tracks.filter((t) => (t.artist || "Unknown Artist") === selectedArtist);
  }, [tracks, selectedArtist]);

  // 再生位置ポーリング
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

  // 画面クリックでメニューを閉じる
  useEffect(() => {
    const handleClickOutside = () => {
      if (contextMenu.visible) {
        setContextMenu((prev) => ({ ...prev, visible: false }));
      }
    };
    window.addEventListener("click", handleClickOutside);
    return () => window.removeEventListener("click", handleClickOutside);
  }, [contextMenu.visible]);

  const rowVirtualizer = useVirtualizer({
    count: filteredTracks.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 28,
    overscan: 15,
  });

  const handleScan = async () => {
    if (!folderPath) return;
    setIsScanning(true);
    try {
      await invoke("scan_directory", { dirPath: folderPath });
      await loadTracks();
      setSelectedIds(new Set());
      setLastSelectedIndex(null);
    } catch (err) {
      alert(`スキャンエラー: ${err}`);
    } finally {
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
      if (filteredTracks.length > 0) {
        handlePlay(filteredTracks[0]);
      }
      return;
    }
    try {
      const playing = await invoke<boolean>("toggle_play_pause");
      setIsPlaying(playing);
    } catch (err) {
      console.error("Toggle play/pause error:", err);
    }
  };

  // 左クリックによる選択（通常 / Shift範囲選択 / Ctrl追加トグル）
  const handleRowClick = (e: React.MouseEvent, index: number, track: Track) => {
    if (e.shiftKey && lastSelectedIndex !== null) {
      const start = Math.min(lastSelectedIndex, index);
      const end = Math.max(lastSelectedIndex, index);
      const nextSelected = new Set(selectedIds);
      for (let i = start; i <= end; i++) {
        nextSelected.add(filteredTracks[i].id);
      }
      setSelectedIds(nextSelected);
    } else if (e.ctrlKey || e.metaKey) {
      const nextSelected = new Set(selectedIds);
      if (nextSelected.has(track.id)) {
        nextSelected.delete(track.id);
      } else {
        nextSelected.add(track.id);
      }
      setSelectedIds(nextSelected);
      setLastSelectedIndex(index);
    } else {
      setSelectedIds(new Set([track.id]));
      setLastSelectedIndex(index);
    }
  };

  // 右クリックメニューのトリガー
  const handleContextMenu = (e: React.MouseEvent, index: number, track: Track) => {
    e.preventDefault();

    // 右クリックされた曲が選択されていなければ、その1曲だけを選択状態にする
    if (!selectedIds.has(track.id)) {
      setSelectedIds(new Set([track.id]));
      setLastSelectedIndex(index);
    }

    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      targetTrack: track,
    });
  };

  // 複数一括削除
  const handleDeleteFromMenu = async () => {
    const targetIds = Array.from(selectedIds);
    if (targetIds.length === 0 && contextMenu.targetTrack) {
      targetIds.push(contextMenu.targetTrack.id);
    }
    setContextMenu((prev) => ({ ...prev, visible: false }));

    const confirmMsg =
      targetIds.length === 1
        ? `「${contextMenu.targetTrack?.title || "選択した曲"}」をライブラリから削除しますか？\n(※実ファイルは削除されません)`
        : `選択中の ${targetIds.length} 曲をライブラリから削除しますか？\n(※実ファイルは削除されません)`;

    if (!window.confirm(confirmMsg)) return;

    try {
      for (const id of targetIds) {
        await invoke("delete_track", { id });
      }

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

  // タグ編集モーダルを開く
  const handleOpenEditModal = () => {
    setContextMenu((prev) => ({ ...prev, visible: false }));

    const targetList = filteredTracks.filter((t) => selectedIds.has(t.id));
    if (targetList.length === 0 && contextMenu.targetTrack) {
      targetList.push(contextMenu.targetTrack);
    }
    if (targetList.length === 0) return;

    setEditingTracks(targetList);

    if (targetList.length === 1) {
      setEditForm({
        title: targetList[0].title,
        artist: targetList[0].artist,
        album: targetList[0].album,
        genre: targetList[0].genre,
      });
    } else {
      // 複数選択時：同じ値なら初期表示、異なれば空欄
      const firstArtist = targetList[0].artist;
      const firstAlbum = targetList[0].album;
      const firstGenre = targetList[0].genre;
      const isSameArtist = targetList.every((t) => t.artist === firstArtist);
      const isSameAlbum = targetList.every((t) => t.album === firstAlbum);
      const isSameGenre = targetList.every((t) => t.genre === firstGenre);

      setEditForm({
        title: "", // 複数はタイトル固定変更を避けるため空
        artist: isSameArtist ? firstArtist : "",
        album: isSameAlbum ? firstAlbum : "",
        genre: isSameGenre ? firstGenre : "",
      });
    }

    setIsEditing(true);
  };

  // タグ保存実行
  const handleSaveTags = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingTracks.length === 0) return;
    setIsSaving(true);

    try {
      const isMulti = editingTracks.length > 1;

      for (const track of editingTracks) {
        const newTitle = isMulti ? track.title : (editForm.title || track.title);
        const newArtist = editForm.artist.trim() !== "" ? editForm.artist : track.artist;
        const newAlbum = editForm.album.trim() !== "" ? editForm.album : track.album;
        const newGenre = editForm.genre.trim() !== "" ? editForm.genre : track.genre;

        await invoke("update_track_tags", {
          id: track.id,
          filePath: track.file_path,
          title: newTitle,
          artist: newArtist,
          album: newAlbum,
          genre: newGenre,
        });
      }

      // 画面更新
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

  // セミコロン区切りの先頭ジャンルを取得する関数
  const getPrimaryGenre = (genreStr: string) => {
    if (!genreStr) return "";
    // セミコロン（半角・全角両対応）で分割し、先頭の余白を除去して取得
    const parts = genreStr.split(/[;；]/);
    return parts[0]?.trim() || "";
  };

  const formatDuration = (sec: number) => {
    const total = Math.floor(sec);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const duration = currentTrack?.duration || 0;
  const progressRatio = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

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
      {/* 1. 操作バー */}
      <div
        style={{
          flexShrink: 0,
          padding: "8px 12px",
          background: "#252526",
          borderBottom: "1px solid #333",
          display: "flex",
          gap: "8px",
          alignItems: "center",
        }}
      >
        <input
          type="text"
          placeholder="絶対パスを入力 (例: D:\Music)"
          value={folderPath}
          onChange={(e) => setFolderPath(e.target.value)}
          style={{
            flex: 1,
            padding: "4px 8px",
            background: "#3c3c3c",
            border: "1px solid #555",
            color: "#fff",
            borderRadius: "3px",
          }}
        />
        <button
          onClick={handleScan}
          disabled={isScanning}
          style={{
            padding: "4px 12px",
            background: "#0e639c",
            color: "#fff",
            border: "none",
            borderRadius: "3px",
            cursor: "pointer",
          }}
        >
          {isScanning ? "スキャン中..." : "スキャン"}
        </button>
        <span style={{ fontSize: "12px", color: "#888" }}>
          {selectedArtist ? `${selectedArtist} (${filteredTracks.length} 曲)` : "0 トラック"}
          {selectedIds.size > 0 && ` [${selectedIds.size} 件選択中]`}
        </span>
      </div>

      {/* 2. メイン領域 */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", overflow: "hidden" }}>
        {/* 左ペイン: アーティスト一覧 */}
        <div
          style={{
            width: "220px",
            flexShrink: 0,
            background: "#181818",
            borderRight: "1px solid #2d2d2d",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "6px 12px",
              background: "#222222",
              borderBottom: "1px solid #2d2d2d",
              fontSize: "11px",
              fontWeight: "bold",
              color: "#888",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}
          >
            アーティスト ({artistList.length})
          </div>

          <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
            {artistList.map((item) => {
              const isSelected = selectedArtist === item.name;
              return (
                <div
                  key={item.name}
                  onClick={() => {
                    setSelectedArtist(item.name);
                    setSelectedIds(new Set());
                    setLastSelectedIndex(null);
                  }}
                  style={{
                    padding: "6px 12px",
                    fontSize: "12px",
                    cursor: "pointer",
                    background: isSelected ? "#094771" : "transparent",
                    color: isSelected ? "#fff" : "#ccc",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) e.currentTarget.style.background = "#2a2d2e";
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) e.currentTarget.style.background = "transparent";
                  }}
                >
                  <span
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      marginRight: "6px",
                    }}
                    title={item.name}
                  >
                    {item.name}
                  </span>
                  <span style={{ fontSize: "10px", color: isSelected ? "#ddd" : "#777", flexShrink: 0 }}>
                    {item.count}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* 右ペイン: トラック一覧テーブル */}
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div
            style={{
              flexShrink: 0,
              display: "grid",
              gridTemplateColumns: "3fr 2fr 2fr 1.5fr 70px",
              padding: "6px 12px",
              background: "#2d2d2d",
              borderBottom: "1px solid #3c3c3c",
              fontSize: "12px",
              fontWeight: "bold",
              color: "#aaa",
            }}
          >
            <div>タイトル</div>
            <div>アーティスト</div>
            <div>アルバム</div>
            <div>ジャンル</div>
            <div style={{ textAlign: "right" }}>長さ</div>
          </div>

          <div
            ref={parentRef}
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: "auto",
              overflowX: "hidden",
              position: "relative",
            }}
          >
            <div
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                width: "100%",
                position: "relative",
              }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const track = filteredTracks[virtualRow.index];
                const isThisTrack = currentTrack?.id === track.id;
                const isSelected = selectedIds.has(track.id);

                let rowBg = virtualRow.index % 2 === 0 ? "#1e1e1e" : "#222222";
                if (isSelected) rowBg = "#04395e";
                if (isThisTrack) rowBg = "#094771";

                return (
                  <div
                    key={track.id}
                    onClick={(e) => handleRowClick(e, virtualRow.index, track)}
                    onDoubleClick={() => handlePlay(track)}
                    onContextMenu={(e) => handleContextMenu(e, virtualRow.index, track)}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                      display: "grid",
                      gridTemplateColumns: "3fr 2fr 2fr 1.5fr 70px",
                      alignItems: "center",
                      padding: "0 12px",
                      fontSize: "12px",
                      cursor: "pointer",
                      userSelect: "none",
                      background: rowBg,
                      color: isThisTrack || isSelected ? "#fff" : "#ccc",
                      borderBottom: "1px solid #282828",
                      outline: isSelected ? "1px solid #007acc" : "none",
                      outlineOffset: "-1px",
                    }}
                  >
                    <div
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        fontWeight: isThisTrack ? "bold" : "normal",
                      }}
                    >
                      {isThisTrack && (isPlaying ? "▶ " : "❚❚ ")}
                      {track.title}
                    </div>
                    <div
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        color: isThisTrack || isSelected ? "#ddd" : "#999",
                      }}
                    >
                      {track.artist}
                    </div>
                    <div
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        color: isThisTrack || isSelected ? "#ddd" : "#999",
                      }}
                    >
                      {track.album}
                    </div>
                    <div
                      title={track.genre} /* マウスを乗せると「Rock; Pop」と全ジャンルがポップアップ表示 */
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        color: isThisTrack || isSelected ? "#ddd" : "#999",
                      }}
                    >
                      {getPrimaryGenre(track.genre)}
                    </div>
                    <div style={{ textAlign: "right", color: isThisTrack || isSelected ? "#ddd" : "#888" }}>
                      {formatDuration(track.duration)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* 3. トランスポート / 再生バー */}
      <div
        style={{
          flexShrink: 0,
          height: "48px",
          background: "#22252a",
          borderTop: "1px solid #333842",
          display: "flex",
          alignItems: "center",
          padding: "0 16px",
          gap: "16px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
          <button
            onClick={handleTogglePlayPause}
            title={isPlaying ? "一時停止" : "再生"}
            style={{
              width: "28px",
              height: "28px",
              borderRadius: "50%",
              background: "#3e4451",
              border: "none",
              color: "#fff",
              fontSize: "12px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#4b5263")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#3e4451")}
          >
            {isPlaying ? "❚❚" : "▶"}
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginLeft: "6px" }}>
            <span style={{ fontSize: "12px", color: "#888", width: "14px", textAlign: "center" }}>
              {volume === 0 ? "🔇" : volume < 0.5 ? "🔉" : "🔊"}
            </span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={volume}
              onChange={handleVolumeChange}
              title={`音量: ${Math.round(volume * 100)}%`}
              className="volume-slider"
              style={{
                width: "70px",
                background: `linear-gradient(to right, #569cd6 0%, #569cd6 ${volume * 100}%, #3e3e42 ${volume * 100}%, #3e3e42 100%)`,
              }}
            />
          </div>
        </div>

        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            minWidth: 0,
            gap: "3px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: "11px",
              color: "#ccc",
              position: "relative",
            }}
          >
            <div
              style={{
                position: "absolute",
                left: "50%",
                transform: "translateX(-50%)",
                maxWidth: "60%",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                textAlign: "center",
              }}
            >
              {currentTrack ? (
                <span>
                  <strong style={{ color: "#fff" }}>{currentTrack.artist}</strong> - {currentTrack.title}
                </span>
              ) : (
                <span style={{ color: "#666" }}>停止中</span>
              )}
            </div>

            <div style={{ width: "80px" }} />

            <div
              style={{
                fontSize: "11px",
                color: "#9da5b4",
                fontVariantNumeric: "tabular-nums",
                textAlign: "right",
                userSelect: "none",
              }}
            >
              {formatDuration(currentTime)} / {formatDuration(duration)}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", width: "100%" }}>
            <input
              type="range"
              min="0"
              max={duration || 100}
              step="0.1"
              value={currentTime}
              disabled={!currentTrack}
              onChange={handleSeekChange}
              onMouseUp={handleSeekCommit}
              onTouchEnd={handleSeekCommit}
              className="seek-slider"
              style={{
                width: "100%",
                background: `linear-gradient(to right, #569cd6 0%, #569cd6 ${progressRatio}%, #3e3e42 ${progressRatio}%, #3e3e42 100%)`,
              }}
            />
          </div>
        </div>
      </div>

      {/* 4. 右クリックメニュー */}
      {contextMenu.visible && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "fixed",
            top: contextMenu.y,
            left: contextMenu.x,
            background: "#252526",
            border: "1px solid #454545",
            boxShadow: "0 4px 12px rgba(0,0,0,0.6)",
            borderRadius: "4px",
            zIndex: 1000,
            padding: "4px 0",
            minWidth: "160px",
            fontSize: "12px",
          }}
        >
          {selectedIds.size <= 1 && contextMenu.targetTrack && (
            <div
              onClick={() => {
                if (contextMenu.targetTrack) handlePlay(contextMenu.targetTrack);
                setContextMenu((prev) => ({ ...prev, visible: false }));
              }}
              style={{ padding: "6px 14px", cursor: "pointer", color: "#eee" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#094771")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              再生
            </div>
          )}
          <div
            onClick={handleOpenEditModal}
            style={{ padding: "6px 14px", cursor: "pointer", color: "#eee" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#094771")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            {selectedIds.size > 1 ? `タグを一括編集 (${selectedIds.size} 件)...` : "タグを編集..."}
          </div>
          <div style={{ height: "1px", background: "#3c3c3c", margin: "4px 0" }} />
          <div
            onClick={handleDeleteFromMenu}
            style={{ padding: "6px 14px", cursor: "pointer", color: "#ff6b6b" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#5a1d1d")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            {selectedIds.size > 1 ? `ライブラリから削除 (${selectedIds.size} 件)` : "ライブラリから削除"}
          </div>
        </div>
      )}

      {/* 5. タグ編集モーダルウィンドウ（単一 / 一括対応） */}
      {isEditing && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            background: "rgba(0, 0, 0, 0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 2000,
          }}
        >
          <div
            style={{
              background: "#252526",
              border: "1px solid #454545",
              borderRadius: "6px",
              width: "440px",
              boxShadow: "0 8px 24px rgba(0,0,0,0.8)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "10px 16px",
                background: "#2d2d2d",
                borderBottom: "1px solid #3c3c3c",
                fontWeight: "bold",
                fontSize: "13px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span>{editingTracks.length > 1 ? `タグの一括編集 (${editingTracks.length} 曲)` : "タグ情報の編集"}</span>
              <span
                onClick={() => setIsEditing(false)}
                style={{ cursor: "pointer", color: "#888", fontSize: "16px" }}
              >
                ✕
              </span>
            </div>

            <form
              onSubmit={handleSaveTags}
              style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}
            >
              {/* タイトル入力欄 */}
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <label style={{ fontSize: "11px", color: "#aaa" }}>
                  タイトル {editingTracks.length > 1 && "(複数選択時は変更不可)"}
                </label>
                <input
                  type="text"
                  value={editingTracks.length > 1 ? "<複数値>" : editForm.title}
                  disabled={editingTracks.length > 1}
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                  style={{
                    padding: "6px 8px",
                    background: editingTracks.length > 1 ? "#2a2a2a" : "#3c3c3c",
                    border: "1px solid #555",
                    color: editingTracks.length > 1 ? "#777" : "#fff",
                    borderRadius: "3px",
                    fontSize: "13px",
                  }}
                  required={editingTracks.length === 1}
                />
              </div>

              {/* アーティスト入力欄 */}
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <label style={{ fontSize: "11px", color: "#aaa" }}>
                  アーティスト {editingTracks.length > 1 && "(空欄の場合は現状維持)"}
                </label>
                <input
                  type="text"
                  placeholder={editingTracks.length > 1 ? "<現状を維持>" : ""}
                  value={editForm.artist}
                  onChange={(e) => setEditForm({ ...editForm, artist: e.target.value })}
                  style={{
                    padding: "6px 8px",
                    background: "#3c3c3c",
                    border: "1px solid #555",
                    color: "#fff",
                    borderRadius: "3px",
                    fontSize: "13px",
                  }}
                />
              </div>

              {/* アルバム入力欄 */}
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <label style={{ fontSize: "11px", color: "#aaa" }}>
                  アルバム {editingTracks.length > 1 && "(空欄の場合は現状維持)"}
                </label>
                <input
                  type="text"
                  placeholder={editingTracks.length > 1 ? "<現状を維持>" : ""}
                  value={editForm.album}
                  onChange={(e) => setEditForm({ ...editForm, album: e.target.value })}
                  style={{
                    padding: "6px 8px",
                    background: "#3c3c3c",
                    border: "1px solid #555",
                    color: "#fff",
                    borderRadius: "3px",
                    fontSize: "13px",
                  }}
                />
              </div>

              {/* ジャンル入力欄 */}
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <label style={{ fontSize: "11px", color: "#aaa" }}>
                  ジャンル (複数時はセミコロン「;」区切り) {editingTracks.length > 1 && "(空欄の場合は現状維持)"}
                </label>
                <input
                  type="text"
                  placeholder={editingTracks.length > 1 ? "<現状を維持>" : "例: Rock; J-Pop; Anime"}
                  value={editForm.genre}
                  onChange={(e) => setEditForm({ ...editForm, genre: e.target.value })}
                  style={{
                    padding: "6px 8px",
                    background: "#3c3c3c",
                    border: "1px solid #555",
                    color: "#fff",
                    borderRadius: "3px",
                    fontSize: "13px",
                  }}
                />
              </div>

              {editingTracks.length === 1 && (
                <div style={{ fontSize: "10px", color: "#777", wordBreak: "break-all", marginTop: "4px" }}>
                  ファイル: {editingTracks[0].file_path}
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "12px" }}>
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  style={{
                    padding: "6px 14px",
                    background: "#3c3c3c",
                    border: "1px solid #555",
                    color: "#ccc",
                    borderRadius: "3px",
                    cursor: "pointer",
                  }}
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  style={{
                    padding: "6px 16px",
                    background: "#0e639c",
                    border: "none",
                    color: "#fff",
                    borderRadius: "3px",
                    cursor: "pointer",
                  }}
                >
                  {isSaving ? "保存中..." : "保存"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}