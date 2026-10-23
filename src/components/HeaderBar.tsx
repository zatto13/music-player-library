import { MainViewMode } from "../types";

interface HeaderBarProps {
  folderPath: string;
  setFolderPath: (val: string) => void;
  isScanning: boolean;
  scannedCount: number;
  handleScan: () => void;
  mainViewMode: MainViewMode;
  setMainViewMode: (mode: MainViewMode) => void;
  selectedKey: string | null;
  filteredCount: number;
  selectedCount: number;
}

export default function HeaderBar({
  folderPath,
  setFolderPath,
  isScanning,
  scannedCount,
  handleScan,
  mainViewMode,
  setMainViewMode,
  selectedKey,
  filteredCount,
  selectedCount,
}: HeaderBarProps) {
  return (
    <div
      style={{
        width: "100%",
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
          background: isScanning ? "#555" : "#0e639c",
          color: "#fff",
          border: "none",
          borderRadius: "3px",
          cursor: isScanning ? "default" : "pointer",
        }}
      >
        {isScanning ? `スキャン中 (${scannedCount} 件)...` : "スキャン"}
      </button>

      <div style={{ display: "flex", background: "#181818", padding: "2px", borderRadius: "4px", gap: "2px", border: "1px solid #3c3c3c" }}>
        <button
          onClick={() => setMainViewMode("albums")}
          style={{
            padding: "3px 10px",
            fontSize: "11px",
            background: mainViewMode === "albums" ? "#0e639c" : "transparent",
            color: mainViewMode === "albums" ? "#fff" : "#888",
            border: "none",
            borderRadius: "3px",
            cursor: "pointer",
          }}
        >
          アルバムとトラック
        </button>
        <button
          onClick={() => setMainViewMode("table")}
          style={{
            padding: "3px 10px",
            fontSize: "11px",
            background: mainViewMode === "table" ? "#0e639c" : "transparent",
            color: mainViewMode === "table" ? "#fff" : "#888",
            border: "none",
            borderRadius: "3px",
            cursor: "pointer",
          }}
        >
          曲リスト
        </button>
      </div>

      <span style={{ fontSize: "12px", color: "#888" }}>
        {selectedKey ? `${selectedKey} (${filteredCount} 曲)` : "0 トラック"}
        {selectedCount > 0 && ` [${selectedCount} 件選択中]`}
      </span>
    </div>
  );
}