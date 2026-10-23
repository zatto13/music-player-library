import { useState, useEffect, useRef } from "react";
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

  const rowVirtualizer = useVirtualizer({
    count: tracks.length,
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

  // タグ編集ウィンドウを開く
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

  // タグの保存実行
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

      // 画面のトラック配列も更新
      setTracks((prev) =>
        prev.map((t) =>
          t.id === editingTrack.id
            ? { ...t, title: editForm.title, artist: editForm.artist, album: editForm.album }
            : t
        )
      );

      // 現在再生中の曲が編集対象ならそれも更新
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
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", fontFamily: "Segoe UI, sans-serif", background: "#1e1e1e", color: "#ddd" }}>
      {/* 操作バー */}
      <div style={{ padding: "8px 12px", background: "#252526", borderBottom: "1px solid #333", display: "flex", gap: "8px", alignItems: "center" }}>
        <input
          type="text"
          placeholder="絶対パスを入力 (例: D:\Music)"
          value={folderPath}
          onChange={(e) => setFolderPath(e.target.value)}
          style={{ flex: 1, padding: "4px 8px", background: "#3c3c3c", border: "1px solid #555", color: "#fff", borderRadius: "3px" }}
        />
        <button
          onClick={handleScan}
          disabled={isScanning}
          style={{ padding: "4px 12px", background: "#0e639c", color: "#fff", border: "none", borderRadius: "3px", cursor: "pointer" }}
        >
          {isScanning ? "スキャン中..." : "スキャン"}
        </button>
        <span style={{ fontSize: "12px", color: "#888" }}>{tracks.length} トラック</span>
      </div>

      {/* テーブルヘッダー */}
      <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr 2fr 70px", padding: "6px 12px", background: "#2d2d2d", borderBottom: "1px solid #3c3c3c", fontSize: "12px", fontWeight: "bold", color: "#aaa" }}>
        <div>タイトル</div>
        <div>アーティスト</div>
        <div>アルバム</div>
        <div style={{ textAlign: "right" }}>長さ</div>
      </div>

      {/* 仮想リストコンテナ */}
      <div ref={parentRef} style={{ flex: 1, overflowY: "auto", position: "relative" }}>
        <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, width: "100%", position: "relative" }}>
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const track = tracks[virtualRow.index];
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
                  background: isPlaying ? "#094771" : virtualRow.index % 2 === 0 ? "#1e1e1e" : "#222222",
                  color: isPlaying ? "#fff" : "#ccc",
                  borderBottom: "1px solid #282828",
                }}
              >
                <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: isPlaying ? "bold" : "normal" }}>{track.title}</div>
                <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: isPlaying ? "#ddd" : "#999" }}>{track.artist}</div>
                <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: isPlaying ? "#ddd" : "#999" }}>{track.album}</div>
                <div style={{ textAlign: "right", color: isPlaying ? "#ddd" : "#888" }}>{formatDuration(track.duration)}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 下部ステータスバー */}
      <div style={{ padding: "8px 16px", background: "#181818", borderTop: "1px solid #2d2d2d", fontSize: "12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        {currentTrack ? (
          <div>
            再生中: <strong>{currentTrack.title}</strong> - {currentTrack.artist} ({formatDuration(currentTrack.duration)})
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
            {/* ウィンドウヘッダー */}
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

            {/* 入力フォーム */}
            <form onSubmit={handleSaveTags} style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <label style={{ fontSize: "11px", color: "#aaa" }}>タイトル</label>
                <input
                  type="text"
                  value={editForm.title}
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                  style={{ padding: "6px 8px", background: "#3c3c3c", border: "1px solid #555", color: "#fff", borderRadius: "3px", fontSize: "13px" }}
                  required
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <label style={{ fontSize: "11px", color: "#aaa" }}>アーティスト</label>
                <input
                  type="text"
                  value={editForm.artist}
                  onChange={(e) => setEditForm({ ...editForm, artist: e.target.value })}
                  style={{ padding: "6px 8px", background: "#3c3c3c", border: "1px solid #555", color: "#fff", borderRadius: "3px", fontSize: "13px" }}
                  required
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <label style={{ fontSize: "11px", color: "#aaa" }}>アルバム</label>
                <input
                  type="text"
                  value={editForm.album}
                  onChange={(e) => setEditForm({ ...editForm, album: e.target.value })}
                  style={{ padding: "6px 8px", background: "#3c3c3c", border: "1px solid #555", color: "#fff", borderRadius: "3px", fontSize: "13px" }}
                  required
                />
              </div>

              <div style={{ fontSize: "10px", color: "#777", wordBreak: "break-all", marginTop: "4px" }}>
                ファイル: {editingTrack.file_path}
              </div>

              {/* ボタングループ */}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "12px" }}>
                <button
                  type="button"
                  onClick={() => setEditingTrack(null)}
                  style={{ padding: "6px 14px", background: "#3c3c3c", border: "1px solid #555", color: "#ccc", borderRadius: "3px", cursor: "pointer" }}
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  style={{ padding: "6px 16px", background: "#0e639c", border: "none", color: "#fff", borderRadius: "3px", cursor: "pointer" }}
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