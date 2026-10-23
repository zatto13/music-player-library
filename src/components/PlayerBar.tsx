import { Track } from "../types";

interface PlayerBarProps {
  currentTrack: Track | null;
  isPlaying: boolean;
  handleTogglePlayPause: () => void;
  volume: number;
  handleVolumeChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  currentTime: number;
  handleSeekChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleSeekCommit: () => void;
  formatDuration: (sec: number) => string;
}

export default function PlayerBar({
  currentTrack,
  isPlaying,
  handleTogglePlayPause,
  volume,
  handleVolumeChange,
  currentTime,
  handleSeekChange,
  handleSeekCommit,
  formatDuration,
}: PlayerBarProps) {
  const duration = currentTrack?.duration || 0;
  const progressRatio = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
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

      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", minWidth: 0, gap: "3px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "11px", color: "#ccc", position: "relative" }}>
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
          <div style={{ fontSize: "11px", color: "#9da5b4", fontVariantNumeric: "tabular-nums", textAlign: "right", userSelect: "none" }}>
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
  );
}