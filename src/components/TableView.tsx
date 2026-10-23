import { RefObject } from "react";
import { Track } from "../types";
import { Virtualizer } from "@tanstack/react-virtual";

interface TableViewProps {
  parentRef: RefObject<HTMLDivElement | null>;
  rowVirtualizer: Virtualizer<HTMLDivElement, Element>;
  filteredTracks: Track[];
  currentTrack: Track | null;
  isPlaying: boolean;
  selectedIds: Set<number>;
  handleRowClick: (e: React.MouseEvent, index: number, track: Track) => void;
  handlePlay: (track: Track) => void;
  handleContextMenu: (e: React.MouseEvent, index: number, track: Track) => void;
  getPrimaryGenre: (genreStr: string) => string;
  formatDuration: (sec: number) => string;
}

export default function TableView({
  parentRef,
  rowVirtualizer,
  filteredTracks,
  currentTrack,
  isPlaying,
  selectedIds,
  handleRowClick,
  handlePlay,
  handleContextMenu,
  getPrimaryGenre,
  formatDuration,
}: TableViewProps) {
  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div
        style={{
          flexShrink: 0,
          display: "grid",
          gridTemplateColumns: "3fr 2fr 2fr 2fr 1.5fr 70px",
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
        <div>アルバムアーティスト</div>
        <div>アルバム</div>
        <div>ジャンル</div>
        <div style={{ textAlign: "right" }}>長さ</div>
      </div>

      <div ref={parentRef} style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", position: "relative" }}>
        <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, width: "100%", position: "relative" }}>
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
                  gridTemplateColumns: "3fr 2fr 2fr 2fr 1.5fr 70px",
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
                <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: isThisTrack ? "bold" : "normal" }}>
                  {isThisTrack && (isPlaying ? "▶ " : "❚❚ ")}
                  {track.title}
                </div>
                <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: isThisTrack || isSelected ? "#ddd" : "#999" }}>
                  {track.artist}
                </div>
                <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: isThisTrack || isSelected ? "#ddd" : "#999" }}>
                  {track.album_artist || "-"}
                </div>
                <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: isThisTrack || isSelected ? "#ddd" : "#999" }}>
                  {track.album}
                </div>
                <div title={track.genre} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: isThisTrack || isSelected ? "#ddd" : "#999" }}>
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
  );
}