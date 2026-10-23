import { Track, GroupedAlbum } from "../types";
import AlbumCover from "./AlbumCover";

interface AlbumViewProps {
  groupedAlbums: GroupedAlbum[];
  filteredTracks: Track[];
  currentTrack: Track | null;
  isPlaying: boolean;
  selectedIds: Set<number>;
  handleRowClick: (e: React.MouseEvent, index: number, track: Track) => void;
  handlePlay: (track: Track) => void;
  handleContextMenu: (e: React.MouseEvent, index: number, track: Track) => void;
  formatDuration: (sec: number) => string;
}

export default function AlbumView({
  groupedAlbums,
  filteredTracks,
  currentTrack,
  isPlaying,
  selectedIds,
  handleRowClick,
  handlePlay,
  handleContextMenu,
  formatDuration,
}: AlbumViewProps) {
  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        overflowY: "auto",
        padding: "16px 24px",
        display: "flex",
        flexDirection: "column",
        gap: "32px",
        background: "#1e1e1e",
      }}
    >
      {groupedAlbums.map((group) => (
        <div
          key={group.albumTitle}
          style={{
            display: "flex",
            flexDirection: "row",
            gap: "20px",
            alignItems: "flex-start",
            width: "100%",
          }}
        >
          {/* 左側: アルバムカバー */}
          <AlbumCover
            filePath={group.tracks[0]?.file_path || ""}
            albumTitle={group.albumTitle}
          />

          {/* 右側: アルバム見出し ＆ 所属トラック一覧 */}
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
            {/* アルバムヘッダー */}
            <div
              style={{
                borderBottom: "1px solid #333",
                paddingBottom: "6px",
                marginBottom: "8px",
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                gap: "12px",
              }}
            >
              <div style={{ display: "flex", alignItems: "baseline", gap: "10px", minWidth: 0 }}>
                <span
                  style={{
                    fontSize: "15px",
                    fontWeight: "bold",
                    color: "#fff",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={group.albumTitle}
                >
                  {group.albumTitle}
                </span>
                <span
                  style={{
                    fontSize: "12px",
                    color: "#888",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {group.albumArtist}
                </span>
              </div>
              <span style={{ fontSize: "11px", color: "#666", flexShrink: 0, whiteSpace: "nowrap" }}>
                {group.count} 曲, {formatDuration(group.totalDuration)}
              </span>
            </div>

            {/* トラック行 */}
            <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
              {group.tracks.map((t, idx) => {
                const isThisTrack = currentTrack?.id === t.id;
                const isSelected = selectedIds.has(t.id);
                const globalIndex = filteredTracks.findIndex((ft) => ft.id === t.id);

                let bg = "transparent";
                if (isSelected) bg = "#04395e";
                if (isThisTrack) bg = "#094771";

                return (
                  <div
                    key={t.id}
                    onClick={(e) => handleRowClick(e, globalIndex >= 0 ? globalIndex : 0, t)}
                    onDoubleClick={() => handlePlay(t)}
                    onContextMenu={(e) => handleContextMenu(e, globalIndex >= 0 ? globalIndex : 0, t)}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "32px 1fr 60px 48px",
                      padding: "4px 8px",
                      fontSize: "12px",
                      alignItems: "center",
                      borderRadius: "3px",
                      background: bg,
                      color: isThisTrack || isSelected ? "#fff" : "#ccc",
                      cursor: "pointer",
                      userSelect: "none",
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected && !isThisTrack) e.currentTarget.style.background = "#2a2d2e";
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected && !isThisTrack) e.currentTarget.style.background = "transparent";
                    }}
                  >
                    {/* トラック番号 */}
                    <div style={{ color: "#777", fontSize: "11px", textAlign: "left" }}>
                      {isThisTrack ? (
                        <span style={{ color: "#569cd6" }}>{isPlaying ? "▶" : "❚❚"}</span>
                      ) : (
                        t.track_number ? String(t.track_number).padStart(2, "0") : String(idx + 1).padStart(2, "0")
                      )}
                    </div>

                    {/* タイトル */}
                    <div
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        fontWeight: isThisTrack ? "bold" : "normal",
                        paddingRight: "12px",
                      }}
                      title={t.title}
                    >
                      {t.title}
                    </div>

                    {/* 評価星 */}
                    <div style={{ color: "#444", fontSize: "10px", letterSpacing: "1px" }}>
                      ★★★★
                    </div>

                    {/* 長さ */}
                    <div style={{ textAlign: "right", color: "#888", fontVariantNumeric: "tabular-nums" }}>
                      {formatDuration(t.duration)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}