import { Track } from "../types";

interface EditModalProps {
  isEditing: boolean;
  editingTracks: Track[];
  editForm: {
    title: string;
    artist: string;
    album_artist: string;
    album: string;
    genre: string;
  };
  setEditForm: React.Dispatch<
    React.SetStateAction<{
      title: string;
      artist: string;
      album_artist: string;
      album: string;
      genre: string;
    }>
  >;
  isSaving: boolean;
  handleSaveTags: (e: React.FormEvent) => void;
  closeModal: () => void;
}

export default function EditModal({
  isEditing,
  editingTracks,
  editForm,
  setEditForm,
  isSaving,
  handleSaveTags,
  closeModal,
}: EditModalProps) {
  if (!isEditing) return null;

  return (
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
          <span onClick={closeModal} style={{ cursor: "pointer", color: "#888", fontSize: "16px" }}>
            ✕
          </span>
        </div>

        <form onSubmit={handleSaveTags} style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
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

          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <label style={{ fontSize: "11px", color: "#aaa" }}>
              アーティスト {editingTracks.length > 1 && "(空欄の場合は現状維持)"}
            </label>
            <input
              type="text"
              placeholder={editingTracks.length > 1 ? "<現状を維持>" : ""}
              value={editForm.artist}
              onChange={(e) => setEditForm({ ...editForm, artist: e.target.value })}
              style={{ padding: "6px 8px", background: "#3c3c3c", border: "1px solid #555", color: "#fff", borderRadius: "3px", fontSize: "13px" }}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <label style={{ fontSize: "11px", color: "#aaa" }}>
              アルバムアーティスト {editingTracks.length > 1 && "(空欄の場合は現状維持)"}
            </label>
            <input
              type="text"
              placeholder={editingTracks.length > 1 ? "<現状を維持>" : ""}
              value={editForm.album_artist}
              onChange={(e) => setEditForm({ ...editForm, album_artist: e.target.value })}
              style={{ padding: "6px 8px", background: "#3c3c3c", border: "1px solid #555", color: "#fff", borderRadius: "3px", fontSize: "13px" }}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <label style={{ fontSize: "11px", color: "#aaa" }}>
              アルバム {editingTracks.length > 1 && "(空欄の場合は現状維持)"}
            </label>
            <input
              type="text"
              placeholder={editingTracks.length > 1 ? "<現状を維持>" : ""}
              value={editForm.album}
              onChange={(e) => setEditForm({ ...editForm, album: e.target.value })}
              style={{ padding: "6px 8px", background: "#3c3c3c", border: "1px solid #555", color: "#fff", borderRadius: "3px", fontSize: "13px" }}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <label style={{ fontSize: "11px", color: "#aaa" }}>
              ジャンル (複数時はセミコロン「;」区切り) {editingTracks.length > 1 && "(空欄の場合は現状維持)"}
            </label>
            <input
              type="text"
              placeholder={editingTracks.length > 1 ? "<現状を維持>" : "例: Rock; J-Pop; Anime"}
              value={editForm.genre}
              onChange={(e) => setEditForm({ ...editForm, genre: e.target.value })}
              style={{ padding: "6px 8px", background: "#3c3c3c", border: "1px solid #555", color: "#fff", borderRadius: "3px", fontSize: "13px" }}
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
              onClick={closeModal}
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
  );
}