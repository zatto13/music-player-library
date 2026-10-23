import { useState, useEffect, useRef, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useVirtualizer } from "@tanstack/react-virtual";

interface Track {
  id: number;
  file_path: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
}

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  track: Track | null;
}

export default function App() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [folderPath, setFolderPath] = useState("");
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [isScanning, setIsScanning] = useState(false);

  // 選択中のアーティスト（null のときは全曲表示）
  const [selectedArtist, setSelectedArtist] = useState<string | null>(null);

  // 右クリックメニューのState
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    track: null,
  });

  // タグ編集モーダルウィンドウ用のState
  const [editingTrack, setEditingTrack] = useState<Track | null>(null);
  const [editForm, setEditForm] = useState({ title: "", artist: "", album: "" });
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

  // アーティスト一覧と各曲数の集計
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

  // 選択中のアーティストで絞り込んだトラック一覧
  const filteredTracks = useMemo(() => {
    if (!selectedArtist) return tracks;
    return tracks.filter((t) => (t.artist || "Unknown Artist") === selectedArtist);
  }, [tracks, selectedArtist]);

  // 仮想スクロールは filteredTracks を対象にする
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
    } catch (err) {
      console.error("Playback error:", err);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, track: Track) => {
    e.preventDefault();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      track: track,
    });
  };

  const handleDeleteFromMenu = async () => {
    if (!contextMenu.track) return;
    const target = contextMenu.track;
    setContextMenu((prev) => ({ ...prev, visible: false }));

    const confirmed = window.confirm(
      `「${target.title}」をライブラリから削除しますか？\n(※実ファイルは削除されません)`
    );
    if (!confirmed) return;

    try {
      await invoke("delete_track", { id: target.id });
      setTracks((prev) => prev.filter((t) => t.id !== target.id));
    } catch (err) {
      console.error("Delete error:", err);
    }
  };

  const handleOpenEditModal = () => {
    if (!contextMenu.track) return;
    setEditingTrack(contextMenu.track);
    setEditForm({
      title: contextMenu.track.title,
      artist: contextMenu.track.artist,
      album: contextMenu.track.album,
    });
    setContextMenu((prev) => ({ ...prev, visible: false }));
  };

  const handleSaveTags = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTrack) return;
    setIsSaving(true);

    try {
      await invoke("update_track_tags", {
        id: editingTrack.id,
        filePath: editingTrack.file_path,
        title: editForm.title,
        artist: editForm.artist,
        album: editForm.album,
      });

      setTracks((prev) =>
        prev.map((t) =>
          t.id === editingTrack.id
            ? { ...t, title: editForm.title, artist: editForm.artist, album: editForm.album }
            : t
        )
      );

      if (currentTrack?.id === editingTrack.id) {
        setCurrentTrack((prev) =>
          prev ? { ...prev, title: editForm.title, artist: editForm.artist, album: editForm.album } : null
        );
      }

      setEditingTrack(null);
    } catch (err) {
      alert(`保存エラー: ${err}`);
    } finally {
      setIsSaving(false);
    }
  };

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
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
          {filteredTracks.length} / {tracks.length} トラック
        </span>
      </div>

      {/* 2. メイン領域（左: アーティスト一覧 / 右: トラックテーブル） */}
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
            アーティスト
          </div>

          <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
            {/* 全てのアーティスト項目 */}
            <div
              onClick={() => setSelectedArtist(null)}
              style={{
                padding: "6px 12px",
                fontSize: "12px",
                cursor: "pointer",
                background: selectedArtist === null ? "#094771" : "transparent",
                color: selectedArtist === null ? "#fff" : "#ccc",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
              onMouseEnter={(e) => {
                if (selectedArtist !== null) e.currentTarget.style.background = "#2a2d2e";
              }}
              onMouseLeave={(e) => {
                if (selectedArtist !== null) e.currentTarget.style.background = "transparent";
              }}
            >
              <span>すべてのアーティスト</span>
              <span style={{ fontSize: "10px", color: selectedArtist === null ? "#ddd" : "#777" }}>
                {tracks.length}
              </span>
            </div>

            {/* 個別アーティストリスト */}
            {artistList.map((item) => {
              const isSelected = selectedArtist === item.name;
              return (
                <div
                  key={item.name}
                  onClick={() => setSelectedArtist(item.name)}
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
          {/* テーブルヘッダー */}
          <div
            style={{
              flexShrink: 0,
              display: "grid",
              gridTemplateColumns: "3fr 2fr 2fr 70px",
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
            <div style={{ textAlign: "right" }}>長さ</div>
          </div>

          {/* 仮想リストコンテナ */}
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
                const isPlaying = currentTrack?.id === track.id;

                return (
                  <div
                    key={track.id}
                    onDoubleClick={() => handlePlay(track)}
                    onContextMenu={(e) => handleContextMenu(e, track)}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                      display: "grid",
                      gridTemplateColumns: "3fr 2fr 2fr 70px",
                      alignItems: "center",
                      padding: "0 12px",
                      fontSize: "12px",
                      cursor: "pointer",
                      userSelect: "none",
                      background: isPlaying
                        ? "#094771"
                        : virtualRow.index % 2 === 0
                        ? "#1e1e1e"
                        : "#222222",
                      color: isPlaying ? "#fff" : "#ccc",
                      borderBottom: "1px solid #282828",
                    }}
                  >
                    <div
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        fontWeight: isPlaying ? "bold" : "normal",
                      }}
                    >
                      {track.title}
                    </div>
                    <div
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        color: isPlaying ? "#ddd" : "#999",
                      }}
                    >
                      {track.artist}
                    </div>
                    <div
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        color: isPlaying ? "#ddd" : "#999",
                      }}
                    >
                      {track.album}
                    </div>
                    <div style={{ textAlign: "right", color: isPlaying ? "#ddd" : "#888" }}>
                      {formatDuration(track.duration)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* 3. 下部ステータスバー */}
      <div
        style={{
          flexShrink: 0,
          padding: "8px 16px",
          background: "#181818",
          borderTop: "1px solid #2d2d2d",
          fontSize: "12px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        {currentTrack ? (
          <div>
            再生中: <strong>{currentTrack.title}</strong> - {currentTrack.artist} (
            {formatDuration(currentTrack.duration)})
          </div>
        ) : (
          <div style={{ color: "#666" }}>停止中</div>
        )}
      </div>

      {/* 右クリックコンテキストメニュー */}
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
            minWidth: "150px",
            fontSize: "12px",
          }}
        >
          <div
            onClick={() => {
              if (contextMenu.track) handlePlay(contextMenu.track);
              setContextMenu((prev) => ({ ...prev, visible: false }));
            }}
            style={{ padding: "6px 14px", cursor: "pointer", color: "#eee" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#094771")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            再生
          </div>
          <div
            onClick={handleOpenEditModal}
            style={{ padding: "6px 14px", cursor: "pointer", color: "#eee" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#094771")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            タグを編集...
          </div>
          <div style={{ height: "1px", background: "#3c3c3c", margin: "4px 0" }} />
          <div
            onClick={handleDeleteFromMenu}
            style={{ padding: "6px 14px", cursor: "pointer", color: "#ff6b6b" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#5a1d1d")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            ライブラリから削除
          </div>
        </div>
      )}

      {/* タグ編集ウィンドウ（モーダルダイアログ） */}
      {editingTrack && (
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
              width: "420px",
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
              <span>タグ情報の編集</span>
              <span
                onClick={() => setEditingTrack(null)}
                style={{ cursor: "pointer", color: "#888", fontSize: "16px" }}
              >
                ✕
              </span>
            </div>

            <form
              onSubmit={handleSaveTags}
              style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <label style={{ fontSize: "11px", color: "#aaa" }}>タイトル</label>
                <input
                  type="text"
                  value={editForm.title}
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                  style={{
                    padding: "6px 8px",
                    background: "#3c3c3c",
                    border: "1px solid #555",
                    color: "#fff",
                    borderRadius: "3px",
                    fontSize: "13px",
                  }}
                  required
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <label style={{ fontSize: "11px", color: "#aaa" }}>アーティスト</label>
                <input
                  type="text"
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
                  required
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <label style={{ fontSize: "11px", color: "#aaa" }}>アルバム</label>
                <input
                  type="text"
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
                  required
                />
              </div>

              <div style={{ fontSize: "10px", color: "#777", wordBreak: "break-all", marginTop: "4px" }}>
                ファイル: {editingTrack.file_path}
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "12px" }}>
                <button
                  type="button"
                  onClick={() => setEditingTrack(null)}
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