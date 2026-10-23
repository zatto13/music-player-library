import { ViewMode, SortTarget, SortOrder } from "../types";

interface PaneItem {
  name: string;
  count: number;
}

interface LeftPaneProps {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  isViewMenuOpen: boolean;
  setIsViewMenuOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  sortTarget: SortTarget;
  setSortTarget: (target: SortTarget) => void;
  sortOrder: SortOrder;
  setSortOrder: (order: SortOrder) => void;
  paneItems: PaneItem[];
  selectedKey: string | null;
  setSelectedKey: (key: string) => void;
  clearSelection: () => void;
}

export default function LeftPane({
  viewMode,
  setViewMode,
  isViewMenuOpen,
  setIsViewMenuOpen,
  sortTarget,
  setSortTarget,
  sortOrder,
  setSortOrder,
  paneItems,
  selectedKey,
  setSelectedKey,
  clearSelection,
}: LeftPaneProps) {
  const getViewModeLabel = (mode: ViewMode) => {
    switch (mode) {
      case "album_artist":
        return "アルバムアーティスト";
      case "artist":
        return "アーティスト";
      case "album":
        return "アルバム";
    }
  };

  return (
    <div
      style={{
        width: "230px",
        flexShrink: 0,
        background: "#181818",
        borderRight: "1px solid #2d2d2d",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        position: "relative",
      }}
    >
      <div
        onClick={(e) => {
          e.stopPropagation();
          setIsViewMenuOpen((prev) => !prev);
        }}
        style={{
          padding: "6px 12px",
          background: "#222222",
          borderBottom: "1px solid #2d2d2d",
          fontSize: "11px",
          fontWeight: "bold",
          color: "#aaa",
          cursor: "pointer",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          userSelect: "none",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "#2a2d2e")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "#222222")}
      >
        <span>
          {getViewModeLabel(viewMode)} ({paneItems.length})
        </span>
        <span style={{ fontSize: "9px", color: "#777" }}>▾</span>
      </div>

      {isViewMenuOpen && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            top: "28px",
            left: "8px",
            background: "#252526",
            border: "1px solid #454545",
            boxShadow: "0 4px 12px rgba(0,0,0,0.6)",
            borderRadius: "4px",
            zIndex: 1100,
            padding: "4px 0",
            minWidth: "180px",
            fontSize: "12px",
          }}
        >
          <div style={{ fontSize: "10px", color: "#777", padding: "4px 12px 2px", fontWeight: "bold" }}>
            表示対象
          </div>
          {(["album_artist", "artist", "album"] as ViewMode[]).map((mode) => (
            <div
              key={mode}
              onClick={() => {
                setViewMode(mode);
                setIsViewMenuOpen(false);
                clearSelection();
              }}
              style={{
                padding: "5px 14px",
                cursor: "pointer",
                color: viewMode === mode ? "#569cd6" : "#eee",
                fontWeight: viewMode === mode ? "bold" : "normal",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#094771")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              {viewMode === mode ? `✓ ${getViewModeLabel(mode)}` : ` ${getViewModeLabel(mode)}`}
            </div>
          ))}

          <div style={{ height: "1px", background: "#3c3c3c", margin: "4px 0" }} />

          <div style={{ fontSize: "10px", color: "#777", padding: "4px 12px 2px", fontWeight: "bold" }}>
            ソート
          </div>
          {[
            { label: "名前 (昇順: A-Z)", target: "name" as const, order: "asc" as const },
            { label: "名前 (降順: Z-A)", target: "name" as const, order: "desc" as const },
            { label: "曲数 (多い順)", target: "count" as const, order: "desc" as const },
            { label: "曲数 (少ない順)", target: "count" as const, order: "asc" as const },
          ].map((item) => {
            const active = sortTarget === item.target && sortOrder === item.order;
            return (
              <div
                key={item.label}
                onClick={() => {
                  setSortTarget(item.target);
                  setSortOrder(item.order);
                  setIsViewMenuOpen(false);
                }}
                style={{
                  padding: "5px 14px",
                  cursor: "pointer",
                  color: active ? "#569cd6" : "#eee",
                  fontWeight: active ? "bold" : "normal",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#094771")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                {active ? `✓ ${item.label}` : ` ${item.label}`}
              </div>
            );
          })}
        </div>
      )}

      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
        {paneItems.map((item) => {
          const isSelected = selectedKey === item.name;
          return (
            <div
              key={item.name}
              onClick={() => {
                setSelectedKey(item.name);
                clearSelection();
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
  );
}