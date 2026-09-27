'use client';

// ————————————————————————————————————————————————————————————————
// V2 — KAPALI (27 eylül, V1 sadelik kararı). Home v2 story'si: kullanıcının kendi widget
// ızgarası ("Senin alanın"): ekleme, sürükleme, boyutlandırma. V1'de Home'u biz tasarlarız;
// bu dosya hiçbir yerden içe aktarılmaz, açılacağı gün buradan bağlanır.
// ————————————————————————————————————————————————————————————————

import React, { useEffect, useRef, useState } from 'react';
import type { CustomWidget, CustomWidgetType } from '@/lib/db';

// ———————————————————————————————————— "Senin alanın" — serbest widget ızgarası ————————————————————————————————————

// Tip tanımları yerel DB şemasıyla birlikte lib/db.ts'te (25 eylül).

// CSS'teki .cz-board ile senkron tut.
const CUSTOM_COLS = 3;
const CELL_H = 88; // px
const BOARD_GAP = 10; // px

const CUSTOM_WIDGET_GALLERY: { type: CustomWidgetType; icon: string; title: string; defaultSize: { w: number; h: number } }[] = [
  { type: 'pomodoro', icon: '⏱️', title: 'Odak Zamanlayıcı', defaultSize: { w: 1, h: 1 } },
  { type: 'foto', icon: '🖼️', title: 'Fotoğraf', defaultSize: { w: 1, h: 1 } },
  { type: 'sayac', icon: '📆', title: 'Sayaç', defaultSize: { w: 1, h: 1 } },
];

export const DEFAULT_CUSTOM_WIDGETS: CustomWidget[] = [
  { id: 'seed-pomodoro', type: 'pomodoro', x: 0, y: 0, w: 1, h: 1 },
  { id: 'seed-foto', type: 'foto', x: 1, y: 0, w: 2, h: 1 },
];

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function rectsOverlap(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function findFreeSlot(existing: CustomWidget[], size: { w: number; h: number }) {
  for (let y = 0; y < 50; y++) {
    for (let x = 0; x <= CUSTOM_COLS - size.w; x++) {
      const cand = { x, y, ...size };
      if (!existing.some((e) => rectsOverlap(cand, e))) return { x, y };
    }
  }
  return { x: 0, y: 0 };
}


export type CustomBoardProps = {
  widgets: CustomWidget[];
  setWidgets: React.Dispatch<React.SetStateAction<CustomWidget[]>>;
  loaded: boolean; // yerel DB'den okuma bitti mi — bitmeden "Boş" yazısı gösterilmez
  editing: boolean;
  setEditing: React.Dispatch<React.SetStateAction<boolean>>;
};

// ———————————————————————————————————— "Senin alanın" — serbest, sürükle/boyutlandır ızgara ————————————————————————————————————

export function CustomWidgetBoard({ widgets, setWidgets, loaded, editing, setEditing }: CustomBoardProps) {
  const [galleryOpen, setGalleryOpen] = useState(false);
  const boardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!editing) setGalleryOpen(false);
  }, [editing]);

  function addWidget(type: CustomWidgetType) {
    const meta = CUSTOM_WIDGET_GALLERY.find((g) => g.type === type)!;
    const pos = findFreeSlot(widgets, meta.defaultSize);
    setWidgets((w) => [...w, { id: crypto.randomUUID(), type, x: pos.x, y: pos.y, w: meta.defaultSize.w, h: meta.defaultSize.h }]);
    setGalleryOpen(false);
  }
  function removeWidget(id: string) {
    setWidgets((w) => w.filter((x) => x.id !== id));
  }
  function updateWidget(id: string, patch: Partial<CustomWidget>) {
    setWidgets((w) => w.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }

  return (
    <div className="custom-zone">
      <div className="custom-zone-head">
        <span className="cz-title">Senin alanın</span>
        <div className="cz-actions">
          {editing && <button type="button" className="cz-btn" onClick={() => setGalleryOpen((v) => !v)}>+ Widget</button>}
          <button type="button" className={`cz-btn${editing ? ' on' : ''}`} onClick={() => setEditing((v) => !v)}>
            {editing ? 'Bitti' : 'Düzenle'}
          </button>
        </div>
      </div>
      <p className="cz-hint">Sabitler yukarıda; burası senin — sürükle, boyutlandır, ekle.</p>

      {galleryOpen && (
        <div className="cz-gallery">
          {CUSTOM_WIDGET_GALLERY.map((g) => (
            <button key={g.type} type="button" className="cz-gallery-item" onClick={() => addWidget(g.type)}>
              <span className="ic">{g.icon}</span><span>{g.title}</span>
            </button>
          ))}
        </div>
      )}

      <div className="cz-board" ref={boardRef}>
        {loaded && widgets.length === 0 && <p className="cz-empty">Boş — &quot;Düzenle&quot;ye basıp widget ekle.</p>}
        {widgets.map((wd) => (
          <CustomWidgetCard
            key={wd.id}
            widget={wd}
            editing={editing}
            boardRef={boardRef}
            onChange={(patch) => updateWidget(wd.id, patch)}
            onRemove={() => removeWidget(wd.id)}
          />
        ))}
      </div>
    </div>
  );
}

function CustomWidgetCard({
  widget, editing, boardRef, onChange, onRemove,
}: {
  widget: CustomWidget;
  editing: boolean;
  boardRef: React.RefObject<HTMLDivElement>;
  onChange: (patch: Partial<CustomWidget>) => void;
  onRemove: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);
  const dragOrigin = useRef({ x: 0, y: 0, origX: 0, origY: 0, cellW: 0 });
  const resizeOrigin = useRef({ x: 0, y: 0, origW: 0, origH: 0, cellW: 0 });
  const [ghostPos, setGhostPos] = useState<{ x: number; y: number } | null>(null);
  const [ghostSize, setGhostSize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    if (!dragging) return;
    function onMove(e: PointerEvent) {
      const o = dragOrigin.current;
      const dCellX = Math.round((e.clientX - o.x) / o.cellW);
      const dCellY = Math.round((e.clientY - o.y) / CELL_H);
      const nx = clamp(o.origX + dCellX, 0, CUSTOM_COLS - widget.w);
      const ny = Math.max(0, o.origY + dCellY);
      setGhostPos({ x: nx, y: ny });
    }
    function onUp() { setDragging(false); }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [dragging, widget.w]);

  useEffect(() => {
    if (!dragging && ghostPos) {
      onChange(ghostPos);
      setGhostPos(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging]);

  useEffect(() => {
    if (!resizing) return;
    function onMove(e: PointerEvent) {
      const o = resizeOrigin.current;
      const dCellX = Math.round((e.clientX - o.x) / o.cellW);
      const dCellY = Math.round((e.clientY - o.y) / CELL_H);
      const nw = clamp(o.origW + dCellX, 1, CUSTOM_COLS - widget.x);
      const nh = clamp(o.origH + dCellY, 1, 4);
      setGhostSize({ w: nw, h: nh });
    }
    function onUp() { setResizing(false); }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [resizing, widget.x]);

  useEffect(() => {
    if (!resizing && ghostSize) {
      onChange(ghostSize);
      setGhostSize(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resizing]);

  function startDrag(e: React.PointerEvent) {
    if (!editing) return;
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cellW = (rect.width - (CUSTOM_COLS - 1) * BOARD_GAP) / CUSTOM_COLS;
    dragOrigin.current = { x: e.clientX, y: e.clientY, origX: widget.x, origY: widget.y, cellW };
    setDragging(true);
  }
  function startResize(e: React.PointerEvent) {
    e.stopPropagation();
    if (!editing) return;
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cellW = (rect.width - (CUSTOM_COLS - 1) * BOARD_GAP) / CUSTOM_COLS;
    resizeOrigin.current = { x: e.clientX, y: e.clientY, origW: widget.w, origH: widget.h, cellW };
    setResizing(true);
  }

  const pos = ghostPos ?? widget;
  const size = ghostSize ?? widget;
  const meta = CUSTOM_WIDGET_GALLERY.find((g) => g.type === widget.type)!;

  return (
    <div
      className={`cw-card${editing ? ' editing' : ''}${dragging || resizing ? ' active' : ''}`}
      style={{ gridColumn: `${pos.x + 1} / span ${size.w}`, gridRow: `${pos.y + 1} / span ${size.h}` }}
      onPointerDown={startDrag}
    >
      {editing && (
        <button
          type="button"
          className="cw-remove"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onRemove}
          aria-label={`${meta.title} widget'ını kaldır`}
        >
          ×
        </button>
      )}
      <CustomWidgetContent type={widget.type} editing={editing} />
      {editing && <div className="cw-resize" onPointerDown={startResize} />}
    </div>
  );
}

// editing=true iken widget içeriği tıklanabilir olmaktan çıkar — sürükleme
// pointerdown'ın karta ulaşması bundan dolayı önemli, içerik onu yutmamalı.
function CustomWidgetContent({ type, editing }: { type: CustomWidgetType; editing: boolean }) {
  if (type === 'pomodoro') return <PomodoroWidget editing={editing} />;
  if (type === 'foto') return <FotoWidget editing={editing} />;
  return <SayacWidget />;
}

function PomodoroWidget({ editing }: { editing: boolean }) {
  const [secondsLeft, setSecondsLeft] = useState(25 * 60);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setSecondsLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [running]);

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const ss = String(secondsLeft % 60).padStart(2, '0');

  return (
    <div className="pw">
      <span className="pw-ic">⏱️</span>
      <span className="pw-time">{mm}:{ss}</span>
      <button type="button" className="pw-btn" disabled={editing} onClick={() => setRunning((r) => !r)}>
        {running ? 'Duraklat' : 'Başlat'}
      </button>
    </div>
  );
}

function FotoWidget({ editing }: { editing: boolean }) {
  const [src, setSrc] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSrc(URL.createObjectURL(file));
  }

  return (
    <div className="fw" onClick={() => { if (!editing) inputRef.current?.click(); }}>
      <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />
      {src ? (
        <img src={src} alt="" />
      ) : (
        <>
          <span className="fw-ic">🖼️</span>
          <span>Kendi resmin<br />(çocuğun, evcil hayvanın…)</span>
        </>
      )}
    </div>
  );
}

function SayacWidget() {
  return (
    <div className="sw">
      <span className="sw-n">12</span>
      <span className="sw-l">gün — reçete yenileme</span>
    </div>
  );
}
