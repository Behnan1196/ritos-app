'use client';

import React, { useEffect, useRef, useState, type ReactNode } from 'react';
import type { CustomWidget, CustomWidgetType } from '@/lib/db';
import { useHomeWidgets } from '@/lib/useHomeWidgets';
import AjandaPane from './ritos/AjandaPane';
import KisiselGelisim from './ritos/KisiselGelisim';
import { SinavTool, useSinavOzeti } from './ritos/Sinav';
import { AyarlarPane, GelenlerTool, SenkronIsareti, useGelenSenkron, useGelenOzeti } from './ritos/Paylasim';
import { useHesapBaslat } from '@/lib/hesap';
import { KilitDugmesi, KilitKapisi } from './ritos/Kilit';

// ————————————————————————————————————————————————————————————————
// Ritos yerleşim laboratuvarı — rite-app'ten AYRI, veri modeline bağlı değil.
// Amaç: Ritos Taslağı'ndaki (Artifact) statik iPad mockup'ının gerçek tarayıcı
// boyutlarında, gerçek etkileşimle (sürüklenebilir ayraç, sekme geçişi, Tool
// açılış modları A/B/C) nasıl hissettirdiğini görmek. 23 eylül.
//
// 24 eylül güncellemesi — Home ekranı gerçek bir widget ızgarası oldu:
//   - Üstte SABİT bölge (Odak Alanları, Günlük Hatırlatıcı/Ölçümler, Notlar,
//     Gelenler, Danışmanlık) — bizim tasarladığımız, kullanıcının taşıyamadığı.
//   - Altta SENİN ALANIN — kullanıcının kendi ekleyip sürükleyip yeniden
//     boyutlandırabildiği serbest bir ızgara (Pomodoro/Fotoğraf/Sayaç gibi
//     placeholder widget'lar örnek olarak duruyor). "Düzenle" moduna
//     girince kartlar hafifçe titrer (iOS'tan tanıdık), sürükle/boyutlandır/
//     kaldır oradan yapılır.
//   - Notlar ile Gelenler artık ayrı iki Tool (Ritos Taslağı, "Notlar ile
//     Gelenler ayrıştı").
//   - Tool açılış modu (A/B/C) artık GLOBAL değil, her widget'ın kendi
//     varsayılanı var (Notlar/Gelenler: A, Danışmanlık: C) — sağ alttaki
//     deney paneli, o an açık olan widget'ın modunu değiştiriyor.
// ————————————————————————————————————————————————————————————————

const NARROW_BREAKPOINT = 760;

type ToolId = 'notlar' | 'gelenler' | 'danismanlik' | 'sinav';
type OpenMode = 'A' | 'B' | 'C';
type RightTab = 'home' | 'gelisim' | 'sohbet' | 'ayarlar';

const TOOL_META: Record<ToolId, { icon: string; title: string }> = {
  notlar: { icon: '📝', title: 'Notlar' },
  gelenler: { icon: '📥', title: 'Gelenler' },
  danismanlik: { icon: '🤝', title: 'Danışmanlık' },
  sinav: { icon: '📚', title: 'Sınav hazırlığı' },
};

// Behnan (24 eylül): "şimdilik A diyorum" — genel varsayılan A, ama
// Danışmanlık gibi dolu-içerikli tipler için tam ekran (C) daha iyi olabilir.
// Açılış modu widget'a özel tanımlı, global bir anahtar değil. (Deney paneli
// bunu canlı değiştirmek için vardı, ama engel olduğu için kaldırıldı — 24
// eylül; gerekirse ileride bir Ayarlar ekranına taşınabilir.)
const OPEN_MODE: Record<ToolId, OpenMode> = {
  notlar: 'A',
  gelenler: 'A',
  danismanlik: 'C',
  sinav: 'C',
};

const DANISANLAR = [
  { ad: 'Aylin', ozet: 'Beslenme görüşmesi bugün 13:30', mesaj: 'Bugünkü öğün fotoğrafını attım 🥗' },
  { ad: 'Mehmet', ozet: '21 günlük seri — emekli olmaya yakın', mesaj: 'Yarın seansı erteleyebilir miyiz?' },
  { ad: 'Nurkan', ozet: 'VO2max ölçümü bu hafta gecikti', mesaj: 'Model uçak kulübünden yeni fotoğraf 📸' },
  { ad: 'Suzan', ozet: 'İnanılan-vs-gerçek karşılaştırması bekliyor', mesaj: 'Ölçüm sonuçlarını nasıl yorumlamalıyım?' },
];

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

const DEFAULT_CUSTOM_WIDGETS: CustomWidget[] = [
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

export default function RitosLab() {
  return <KilitKapisi><RitosUygulama /></KilitKapisi>;
}

function RitosUygulama() {
  useHesapBaslat();
  useGelenSenkron();
  const [isNarrow, setIsNarrow] = useState(false);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    function onResize() {
      setWidth(window.innerWidth);
      setIsNarrow(window.innerWidth < NARROW_BREAKPOINT);
    }
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // sürüklenebilir oran (Ajanda ana panel genişliği, %)
  const [ratio, setRatio] = useState(58);
  const [prevRatio, setPrevRatio] = useState<number | null>(null);

  const [rightTab, setRightTab] = useState<RightTab>('home');
  const [activeTool, setActiveTool] = useState<ToolId | null>(null);

  // "Senin alanın" — Home'un dar/geniş görünümler arasında AYNI kalması için
  // (rail vs mobil sekme sadece kapsayıcı değişiyor, widget düzeni değişmiyor).
  // 25 eylül: artık yerel DB'de (IndexedDB/Dexie) kalıcı — yenilemede kaybolmuyor.
  const { widgets: customWidgets, setWidgets: setCustomWidgets, loaded: customLoaded } = useHomeWidgets(DEFAULT_CUSTOM_WIDGETS);
  const [customEditing, setCustomEditing] = useState(false);

  function openTool(tool: ToolId) {
    if (OPEN_MODE[tool] === 'A') {
      setPrevRatio(ratio);
      setRatio(30);
    }
    setActiveTool(tool);
  }
  function closeTool() {
    setActiveTool(null);
    if (prevRatio != null) {
      setRatio(prevRatio);
      setPrevRatio(null);
    }
  }

  const currentMode = activeTool ? OPEN_MODE[activeTool] : null;
  const showInlineTool = activeTool && currentMode === 'A';
  const showOverlayTool = activeTool && (currentMode === 'B' || currentMode === 'C');

  const customBoardProps = {
    widgets: customWidgets,
    setWidgets: setCustomWidgets,
    loaded: customLoaded,
    editing: customEditing,
    setEditing: setCustomEditing,
  };

  return (
    <div className="shell">
      {!isNarrow && (
        <div className="topbar">
          <b>Ritos</b>
          <SenkronIsareti />
          <KilitDugmesi />
          <span className="w">{width}px · geniş (iPad tipi)</span>
        </div>
      )}

      {isNarrow ? (
        <MobileShell
          activeTool={activeTool}
          onOpenTool={openTool}
          onCloseTool={closeTool}
          customBoardProps={customBoardProps}
        />
      ) : (
        <SplitPane
          ratio={ratio}
          setRatio={setRatio}
          left={<AjandaPane />}
          right={
            showInlineTool ? (
              <ToolDetail tool={activeTool!} onBack={closeTool} compact />
            ) : (
              <HomeRay rightTab={rightTab} setRightTab={setRightTab} onOpenTool={openTool} customBoardProps={customBoardProps} />
            )
          }
        />
      )}

      {!isNarrow && showOverlayTool && (
        <div className="tool-overlay">
          <div className="tool-topbar">
            <button className="tool-back" onClick={closeTool}>‹ Home&apos;a dön</button>
            <b>{TOOL_META[activeTool!].icon} {TOOL_META[activeTool!].title}</b>
          </div>
          <div className="tool-body">
            <ToolDetail tool={activeTool!} onBack={closeTool} nested={currentMode === 'C'} />
          </div>
        </div>
      )}
    </div>
  );
}

// ———————————————————————————————————— yeniden kullanılabilir sürüklenebilir iki-panel ————————————————————————————————————

function SplitPane({
  left, right, ratio, setRatio, min = 25, max = 75,
}: {
  left: ReactNode; right: ReactNode; ratio: number; setRatio: (n: number) => void; min?: number; max?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!dragging) return;
    function onMove(e: MouseEvent) {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      let pct = ((e.clientX - rect.left) / rect.width) * 100;
      pct = Math.max(min, Math.min(max, pct));
      setRatio(pct);
    }
    function onUp() { setDragging(false); }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragging, min, max, setRatio]);

  return (
    <div className="split" ref={containerRef}>
      <div className="split-main" style={{ width: ratio + '%' }}>{left}</div>
      <div className={`split-divider${dragging ? ' dragging' : ''}`} onMouseDown={() => setDragging(true)} />
      <div className="split-side" style={{ width: 100 - ratio + '%' }}>{right}</div>
    </div>
  );
}

// ———————————————————————————————————— Ajanda (sol / ana panel — hep sabit) ————————————————————————————————————

// ———————————————————————————————————— sağ ray: sekmeler + Home widget ızgarası ————————————————————————————————————

type CustomBoardProps = {
  widgets: CustomWidget[];
  setWidgets: React.Dispatch<React.SetStateAction<CustomWidget[]>>;
  loaded: boolean; // yerel DB'den okuma bitti mi — bitmeden "Boş" yazısı gösterilmez
  editing: boolean;
  setEditing: React.Dispatch<React.SetStateAction<boolean>>;
};

function HomeRay({
  rightTab, setRightTab, onOpenTool, customBoardProps,
}: { rightTab: RightTab; setRightTab: (t: RightTab) => void; onOpenTool: (t: ToolId) => void; customBoardProps: CustomBoardProps }) {
  return (
    <>
      <div className="side-content">
        {rightTab === 'home' && (
          <>
            <FixedWidgets onOpenTool={onOpenTool} />
            <CustomWidgetBoard {...customBoardProps} />
          </>
        )}

        {rightTab === 'gelisim' && <KisiselGelisim />}
        {rightTab === 'sohbet' && <PlaceholderPane baslik="💬 Sohbet" satirlar={['Henüz altyapı yok']} not="Bkz. Ritos Taslağı — en zayıf kategori." />}
        {rightTab === 'ayarlar' && <AyarlarPane />}
      </div>

      <div className="side-tabs">
        <button className={rightTab === 'home' ? 'on' : ''} onClick={() => setRightTab('home')}><span>🏠</span>Home</button>
        <button className={rightTab === 'gelisim' ? 'on' : ''} onClick={() => setRightTab('gelisim')}><span>🌱</span>Kişisel Gelişim</button>
        <button className={rightTab === 'sohbet' ? 'on' : ''} onClick={() => setRightTab('sohbet')}><span>💬</span>Sohbet</button>
        <button className={rightTab === 'ayarlar' ? 'on' : ''} onClick={() => setRightTab('ayarlar')}><span>⚙️</span>Ayarlar</button>
      </div>
    </>
  );
}

function PlaceholderPane({ baslik, satirlar, not }: { baslik: string; satirlar: string[]; not: string }) {
  return (
    <div>
      <h4>{baslik}</h4>
      {satirlar.map((s) => (
        <div key={s} className="wrow" style={{ cursor: 'default' }}><span className="tx"><span className="t">{s}</span></span></div>
      ))}
      {not && <p style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 10 }}>{not}</p>}
    </div>
  );
}

// ———————————————————————————————————— Sabit bölge — bizim tasarladığımız widget'lar ————————————————————————————————————

function FixedWidgets({ onOpenTool }: { onOpenTool: (t: ToolId) => void }) {
  const gelen = useGelenOzeti();
  const sinav = useSinavOzeti();
  const [odakAcik, setOdakAcik] = useState(true);

  return (
    <div className="fixed-widgets">
      <div className="cc-head" onClick={() => setOdakAcik((v) => !v)}>
        🎯 Odak Alanları <span className="chev">{odakAcik ? '⌄' : '›'}</span>
      </div>
      {odakAcik && (
        <div className="cc-body">
          <div className="grid2">
            <div className="mini-alan"><div className="t">Beslenme</div><div className="s">İyi gidiyor</div></div>
            <div className="mini-alan"><div className="t">Uyku</div><div className="s">Orta</div></div>
          </div>
        </div>
      )}

      <div className="wgrid2">
        <div className="wmini"><span className="ic">🔔</span><span className="t">Günlük Hatırlatıcı</span><span className="s">3/5 alındı</span></div>
        <div className="wmini"><span className="ic">📊</span><span className="t">Ölçümler</span><span className="s">3 gün önce</span></div>
      </div>

      <div className="wgrid2">
        <button type="button" className="wmini tool" onClick={() => onOpenTool('notlar')}>
          <span className="ic">📝</span>
          <span className="t">Notlar</span>
          <span className="s">stil/checklist</span>
        </button>
        <button type="button" className="wmini tool" onClick={() => onOpenTool('gelenler')}>
          <span className="ic">📥</span>
          <span className="t">Gelenler</span>
          <span className={`s${gelen.yeni ? ' yeni' : ''}`}>{gelen.yeni ? `${gelen.yeni} yeni` : gelen.toplam ? `${gelen.toplam} öğe` : 'boş'}</span>
        </button>
      </div>

      {sinav.kurulu && (
        <button type="button" className="wrow tool" onClick={() => onOpenTool('sinav')}>
          <span className="ic">📚</span>
          <span className="tx"><span className="t">Sınav hazırlığı</span><span className="s">{sinav.ozet}</span></span>
          <span className="chev">›</span>
        </button>
      )}

      <button type="button" className="wrow tool" onClick={() => onOpenTool('danismanlik')}>
        <span className="ic">🤝</span>
        <span className="tx"><span className="t">Danışmanlık</span><span className="s">4 aktif danışan · yeni mesaj: Aylin</span></span>
        <span className="chev">›</span>
      </button>
    </div>
  );
}

// ———————————————————————————————————— "Senin alanın" — serbest, sürükle/boyutlandır ızgara ————————————————————————————————————

function CustomWidgetBoard({ widgets, setWidgets, loaded, editing, setEditing }: CustomBoardProps) {
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

// ———————————————————————————————————— Tool içerikleri ————————————————————————————————————

function ToolDetail({ tool, onBack, compact, nested }: { tool: ToolId; onBack: () => void; compact?: boolean; nested?: boolean }) {
  if (tool === 'notlar') return <NotlarPane compact={compact} onBack={onBack} />;
  if (tool === 'gelenler') return <GelenlerTool compact={compact} onBack={onBack} />;
  if (tool === 'sinav') return <SinavTool />;
  return <Danismanlik compact={compact} nested={nested} onBack={onBack} />;
}

function NotlarPane({ compact, onBack }: { compact?: boolean; onBack: () => void }) {
  return (
    <div className="side-content" style={{ height: '100%', overflowY: 'auto' }}>
      {compact && <button className="tool-back" style={{ marginBottom: 10 }} onClick={onBack}>‹ Home</button>}
      <h4>📝 Notlar</h4>
      <div className="wrow" style={{ cursor: 'default' }}><span className="ic">📝</span><span className="tx"><span className="t">Sabah 10 dk yürüyüş fikri</span></span></div>
      <div className="wrow" style={{ cursor: 'default' }}><span className="ic">✓</span><span className="tx"><span className="t">Su hedefi — checklist</span></span></div>
      <div className="wrow" style={{ cursor: 'default' }}><span className="ic">🖊️</span><span className="tx"><span className="t">Aylin ile konuşulacaklar — kalın/madde</span></span></div>
      <p style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 10 }}>
        Ajanda&apos;daki eski &quot;+ Hızlı Ekle&quot; not alanının yerini alıyor — notların yeni birincil yeri artık burası.
      </p>
    </div>
  );
}

function Danismanlik({ compact, nested, onBack }: { compact?: boolean; nested?: boolean; onBack: () => void }) {
  const [secili, setSecili] = useState(0);
  const [altSekme, setAltSekme] = useState<'sohbet' | 'gelisim'>('sohbet');
  const [innerRatio, setInnerRatio] = useState(28); // sadece C modunda kullanılır, ama hook her zaman çağrılmalı
  const d = DANISANLAR[secili];

  const liste = (horiz: boolean) => (
    <div className={`danisan-list${horiz ? ' horiz' : ''}`}>
      {DANISANLAR.map((x, i) => (
        <button key={x.ad} className={`danisan-chip${i === secili ? ' on' : ''}`} onClick={() => setSecili(i)}>
          {x.ad}
          {!horiz && <div style={{ fontWeight: 400, color: 'var(--muted)', fontSize: 10.5, marginTop: 2 }}>{x.ozet}</div>}
        </button>
      ))}
    </div>
  );

  const detay = (
    <div className="danisan-detail">
      {!nested && (
        <div className="video-box">🎥 Görüşme — video görüşme yer tutucu</div>
      )}
      <div className="subtabs">
        <button className={altSekme === 'sohbet' ? 'on' : ''} onClick={() => setAltSekme('sohbet')}>Sohbet</button>
        <button className={altSekme === 'gelisim' ? 'on' : ''} onClick={() => setAltSekme('gelisim')}>Gelişim</button>
      </div>
      {altSekme === 'sohbet' ? (
        <div className="msg-row"><div className="who">{d.ad}</div>{d.mesaj}</div>
      ) : (
        <div className="msg-row"><div className="who">Odak</div>{d.ozet}</div>
      )}
    </div>
  );

  // compact = A modu (sağ ray içinde, dar) → sadece liste + özet, video/detay yok (kasıtlı — sığmıyor)
  if (compact) {
    return (
      <div className="side-content" style={{ height: '100%', overflowY: 'auto' }}>
        <button className="tool-back" style={{ marginBottom: 10 }} onClick={onBack}>‹ Home</button>
        <h4>🤝 Danışmanlık</h4>
        {liste(false)}
        <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>
          Bu dar alanda video/detay gösterilmiyor — A modunun sınırı tam da bu.
        </p>
      </div>
    );
  }

  // nested = C modu (tam ekran + kendi iç sürüklenebilir düzeni: video üstte,
  // altında değişen sohbet/gelişim — sınav koçluğu ön çalışmasındaki fikir)
  if (nested) {
    return (
      <SplitPane
        ratio={innerRatio}
        setRatio={setInnerRatio}
        min={18}
        max={45}
        left={<div style={{ padding: 12, height: '100%', overflowY: 'auto' }}>{liste(false)}</div>}
        right={detay}
      />
    );
  }

  // B modu — tam ekran ama düz, tek sütun
  return (
    <div style={{ height: '100%', overflowY: 'auto' }}>
      {liste(true)}
      {detay}
    </div>
  );
}

// ———————————————————————————————————— dar ekran (iPhone tipi) ————————————————————————————————————

function MobileShell({
  activeTool, onOpenTool, onCloseTool, customBoardProps,
}: {
  activeTool: ToolId | null;
  onOpenTool: (t: ToolId) => void;
  onCloseTool: () => void;
  customBoardProps: CustomBoardProps;
}) {
  const [tab, setTab] = useState<'home' | 'ajanda' | 'gelisim' | 'sohbet' | 'ayarlar'>('ajanda');
  const mode = activeTool ? OPEN_MODE[activeTool] : null;

  return (
    <div className="mobile-app">
      <div className="mobile-hd"><b>Ritos</b><SenkronIsareti /><KilitDugmesi /></div>
      <div className="mobile-main">
        {tab === 'ajanda' && <AjandaPane />}
        {tab === 'home' && <MobileHome onOpenTool={onOpenTool} customBoardProps={customBoardProps} />}
        {tab === 'gelisim' && <KisiselGelisim />}
        {tab === 'sohbet' && <PlaceholderPane baslik="💬 Sohbet" satirlar={['Henüz altyapı yok']} not="" />}
        {tab === 'ayarlar' && <AyarlarPane />}
      </div>
      <div className="mobile-nav">
        <button className={tab === 'home' ? 'on' : ''} onClick={() => setTab('home')}><span className="ic">🏠</span>Home</button>
        <button className={tab === 'ajanda' ? 'on' : ''} onClick={() => setTab('ajanda')}><span className="ic">📅</span>Ajanda</button>
        <button className={tab === 'gelisim' ? 'on' : ''} onClick={() => setTab('gelisim')}><span className="ic">🌱</span>Gelişim</button>
        <button className={tab === 'sohbet' ? 'on' : ''} onClick={() => setTab('sohbet')}><span className="ic">💬</span>Sohbet</button>
        <button className={tab === 'ayarlar' ? 'on' : ''} onClick={() => setTab('ayarlar')}><span className="ic">⚙️</span>Ayarlar</button>
      </div>

      {activeTool && (
        <div className="tool-overlay">
          <div className="tool-topbar">
            <button className="tool-back" onClick={onCloseTool}>‹ Home&apos;a dön</button>
            <b>{TOOL_META[activeTool].icon} {TOOL_META[activeTool].title}</b>
          </div>
          <div className="tool-body">
            <ToolDetail tool={activeTool} onBack={onCloseTool} nested={mode === 'C'} />
          </div>
        </div>
      )}
    </div>
  );
}

function MobileHome({ onOpenTool, customBoardProps }: { onOpenTool: (t: ToolId) => void; customBoardProps: CustomBoardProps }) {
  return (
    <div>
      <FixedWidgets onOpenTool={onOpenTool} />
      <CustomWidgetBoard {...customBoardProps} />
    </div>
  );
}
