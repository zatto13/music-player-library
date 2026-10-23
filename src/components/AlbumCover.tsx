import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

interface AlbumCoverProps {
  filePath: string;
  albumTitle: string;
}

export default function AlbumCover({ filePath, albumTitle }: AlbumCoverProps) {
  const [artUrl, setArtUrl] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    invoke<string | null>("get_album_art", {
      filePath,
      albumName: albumTitle,
    })
      .then((res) => {
        if (isMounted) setArtUrl(res);
      })
      .catch(() => {
        if (isMounted) setArtUrl(null);
      });

    return () => {
      isMounted = false;
    };
  }, [filePath, albumTitle]);

  return (
    <div
      style={{
        width: "130px",
        height: "130px",
        minWidth: "130px",
        minHeight: "130px",
        flexShrink: 0,
        background: "#22252a",
        border: "1px solid #3c3c3c",
        borderRadius: "4px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "0 4px 10px rgba(0,0,0,0.5)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {artUrl ? (
        <img
          src={artUrl}
          alt={albumTitle}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
          }}
        />
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
            height: "100%",
            padding: "8px",
            boxSizing: "border-box",
          }}
        >
          <span style={{ fontSize: "36px", opacity: 0.25 }}>💿</span>
          <span
            style={{
              fontSize: "10px",
              color: "#777",
              textAlign: "center",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              width: "100%",
              marginTop: "4px",
            }}
          >
            {albumTitle}
          </span>
        </div>
      )}
    </div>
  );
}