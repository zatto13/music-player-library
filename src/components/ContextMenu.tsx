import { ContextMenuState, Track } from "../types";

interface ContextMenuProps {
  contextMenu: ContextMenuState;
  selectedIds: Set<number>;
  handlePlay: (track: Track) => void;
  handleOpenEditModal: () => void;
  handleDeleteFromMenu: () => void;
  closeMenu: () => void;
}

export default function ContextMenu({
  contextMenu,
  selectedIds,
  handlePlay,
  handleOpenEditModal,
  handleDeleteFromMenu,
  closeMenu,
}: ContextMenuProps) {
  if (!contextMenu.visible) return null;

  return (
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
            closeMenu();
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
  );
}