import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useVirtualizer } from "@tanstack/react-virtual";

//変数定義
interface Track {
  id: number;
  file_path: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
}

// 右クリックメニューの表示状態
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

  // 右クリックメニュー用のState
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    track: null,
  });

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

  // 画面のどこかをクリックしたときにメニューを閉じる
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

  // 右クリック時にメニュー位置を設定して開く
  const handleContextMenu = (e: React.MouseEvent, track: Track) => {
    e.preventDefault(); // ブラウザ標準の右クリックメニューを抑制
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      track: track,
    });
  };

  // メニュー内の「ライブラリから削除」を押した時の処理
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
      // 画面のリストから即座に除外
      setTracks((prev) => prev.filter((t) => t.id !== target.id));
    } catch (err) {
      console.error("Delete error:", err);
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
        display: "flex",
        flexDirection: "column",
        fontFamily: "Segoe UI, sans-serif",
        background: "#1e1e1e",
        color: "#ddd",
      }}
    >
      {/* 操作バー */}
      <div
        style={{
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
          {tracks.length} トラック
        </span>
      </div>

      {/* テーブルヘッダー */}
      <div
        style={{
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
      <div ref={parentRef} style={{ flex: 1, overflowY: "auto", position: "relative" }}>
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
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
                <div
                  style={{
                    textAlign: "right",
                    color: isPlaying ? "#ddd" : "#888",
                  }}
                >
                  {formatDuration(track.duration)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 下部ステータスバー */}
      <div
        style={{
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
          onClick={(e) => e.stopPropagation()} // メニュー内のクリックで外側イベントが暴発しないようにする
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
            style={{
              padding: "6px 14px",
              cursor: "pointer",
              color: "#eee",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#094771")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            再生
          </div>
          <div
            style={{
              height: "1px",
              background: "#3c3c3c",
              margin: "4px 0",
            }}
          />
          <div
            onClick={handleDeleteFromMenu}
            style={{
              padding: "6px 14px",
              cursor: "pointer",
              color: "#ff6b6b",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#5a1d1d")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            ライブラリから削除
          </div>
        </div>
      )}
    </div>
  );
}