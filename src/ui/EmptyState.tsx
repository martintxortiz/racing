"use client";
import { useState } from "react";
import { fmtBytes } from "@/data/format";
import { useApp } from "@/state/app";
import { Button } from "./controls";
import { IconUpload } from "./icons";
import { pickFile, SAMPLE_URL } from "./files";
import css from "./Empty.module.css";

const FORMAT_URL = "https://github.com/martintxortiz/f1data/blob/main/docs/DATA_FORMAT.md";

export function EmptyState() {
  const status = useApp((s) => s.status);
  const error = useApp((s) => s.error);
  const progress = useApp((s) => s.progress);
  const source = useApp((s) => s.source);
  const [over, setOver] = useState(false);
  const open = useApp.getState().openSource;

  if (status === "opening") {
    const pct = progress && progress.total > 0 ? (progress.loaded / progress.total) * 100 : progress?.phase === "download" ? 4 : 60;
    const phase =
      progress?.phase === "download"
        ? progress.total
          ? `Downloading ${fmtBytes(progress.loaded)} of ${fmtBytes(progress.total)}`
          : `Downloading ${fmtBytes(progress.loaded)}`
        : progress?.phase === "index"
          ? "Reading the file index"
          : "Decoding timing and session data";
    return (
      <div className={css.wrap}>
        <div className={css.card} aria-busy="true">
          <h1 className={css.title}>Opening {source?.name ?? "session"}</h1>
          <div className={css.progress}>
            <div className={css.bar} style={{ width: `${pct}%` }} />
          </div>
          <div className={css.phase}>
            <span>{phase}</span>
            <span className="num">{progress?.total ? `${Math.round(pct)}%` : ""}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={css.wrap}>
      <div className={css.card}>
        <h1 className={css.title}>Open a session</h1>
        <p className={css.lead}>Replay timing, track position and telemetry from an MCAP recording. The file is read in your browser and is not uploaded anywhere.</p>
        {status === "error" && <p className={css.error}>Could not open {source?.name ?? "the file"}: {error}</p>}
        <div className={css.actions}>
          <Button
            variant="primary"
            size="large"
            onClick={async () => {
              const f = await pickFile(".mcap");
              if (f) open({ file: f, kind: "file" });
            }}
          >
            <IconUpload size={15} /> Open .mcap
          </Button>
          <Button size="large" onClick={() => open({ url: SAMPLE_URL, name: "Sample session", kind: "sample" })}>
            Load sample
          </Button>
        </div>
        <div
          className={css.drop}
          data-over={over}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            const f = e.dataTransfer.files[0];
            if (f) open({ file: f, kind: "file" });
          }}
        >
          or drop an .mcap file here
        </div>
        <div className={css.foot}>
          Topics follow the{" "}
          <a href={FORMAT_URL} target="_blank" rel="noreferrer">
            racing MCAP data format
          </a>
          . Add <code>?src=&lt;url&gt;</code> to the address to open a file from a URL.
        </div>
      </div>
    </div>
  );
}
