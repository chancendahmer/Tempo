"use client";
import { useEffect, useRef, useState } from "react";
import { FiCamera, FiCheck, FiCoffee, FiSearch, FiX } from "react-icons/fi";
import { foodProductSchema, scaleFood, type FoodProduct } from "@/server/domain/food";
import type { LifeItem, SavedLifeItem } from "@/server/domain/life-items";
import s from "./workspace.module.css";

type Detector = { detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]> };
type DetectorConstructor = { new(options: { formats: string[] }): Detector; getSupportedFormats(): Promise<string[]> };
export function FoodSearch({ date, preview, recent, onSave, onClose, onManual }: { date: string; preview: boolean; recent: SavedLifeItem[]; onSave: (food: LifeItem) => Promise<boolean>; onClose: () => void; onManual: () => void }) {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"search" | "barcode" | "recent">("search");
  const [products, setProducts] = useState<FoodProduct[]>([]);
  const [selected, setSelected] = useState<FoodProduct | null>(null);
  const [amount, setAmount] = useState(100);
  const [unit, setUnit] = useState<"g" | "ml">("g");
  const [meal, setMeal] = useState<"Breakfast" | "Lunch" | "Dinner" | "Snack">("Breakfast");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const generation = useRef(0);
  const searchVersion = useRef(0);
  const active = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function stopCamera() { generation.current++; stream.current?.getTracks().forEach(track => track.stop()); stream.current = null; if (timer.current) clearTimeout(timer.current); setScanning(false); }
  useEffect(() => {
    active.current = true; dialog.current?.showModal();
    const generationRef = generation, searchRef = searchVersion;
    return () => { active.current = false; generationRef.current++; searchRef.current++; stream.current?.getTracks().forEach(track => track.stop()); if (timer.current) clearTimeout(timer.current); };
  }, []);
  async function search(barcode?: string) {
    stopCamera(); setSelected(null); setMessage("");
    if (preview) { setMessage("Food search uses the live Open Food Facts database after login. You can try manual logging or a recent sample food in this preview."); return; }
    const version = ++searchVersion.current;
    setLoading(true);
    try {
      const response = await fetch(`/api/account/foods?${barcode ? `barcode=${encodeURIComponent(barcode)}` : `q=${encodeURIComponent(query.trim())}`}`, { cache: "no-store" });
      const result = await response.json();
      if (!active.current || version !== searchVersion.current) return;
      if (!response.ok) throw new Error(result.error);
      const rows = (result.products as unknown[]).map(product => foodProductSchema.parse(product));
      setProducts(rows); if (!rows.length) setMessage("No match found. Try the brand and product name, or add the label values manually.");
    } catch (error) { if (active.current && version === searchVersion.current) { setProducts([]); setMessage(error instanceof Error ? error.message : "Food search is unavailable."); } }
    finally { if (active.current && version === searchVersion.current) setLoading(false); }
  }
  async function camera() {
    stopCamera(); setMessage("");
    const DetectorAPI = (window as unknown as { BarcodeDetector?: DetectorConstructor }).BarcodeDetector;
    if (!DetectorAPI || !navigator.mediaDevices?.getUserMedia) { setMessage("Camera scanning isn’t supported in this browser. Enter the barcode below, use a USB scanner, or open Tempo in a supported Chrome browser over HTTPS."); return; }
    const token = generation.current;
    try {
      const supported = await DetectorAPI.getSupportedFormats();
      const formats = ["ean_13", "ean_8", "upc_a", "upc_e"].filter(format => supported.includes(format));
      if (!formats.length) throw new Error("This browser cannot read food barcodes. Enter the barcode instead.");
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      if (!active.current || token !== generation.current) { media.getTracks().forEach(track => track.stop()); return; }
      stream.current = media; setScanning(true);
      if (video.current) { video.current.srcObject = media; await video.current.play(); }
      const detector = new DetectorAPI({ formats });
      const scan = async () => {
        if (!active.current || token !== generation.current) return;
        try {
          const results = video.current?.readyState && video.current.readyState >= 2 ? await detector.detect(video.current) : [];
          if (!active.current || token !== generation.current) return;
          const code = results.find(result => /^\d{8,14}$/.test(result.rawValue))?.rawValue;
          if (code) { setQuery(code); await search(code); return; }
          timer.current = setTimeout(scan, 300);
        } catch { stopCamera(); setMessage("The camera couldn’t read that barcode. Try again or enter its numbers."); }
      };
      void scan();
    } catch (error) { stopCamera(); setMessage(error instanceof Error && error.name !== "NotAllowedError" ? error.message : "Camera permission was not granted. You can still enter or scan the barcode with a USB scanner."); }
  }
  const nutrients = selected && amount > 0 && amount <= 10000 ? scaleFood(selected, amount) : null;
  return <dialog ref={dialog} className={`${s.dialog} ${s.foodDialog}`} onCancel={onClose}>
    <div className={s.between}><div><p className={s.eyebrow}>YOUR FOOD DIARY</p><h2>What’s on your plate?</h2></div><button className={s.iconButton} aria-label="Close food search" onClick={onClose}><FiX /></button></div>
    <div className={s.tabs}>{(["search", "barcode", "recent"] as const).map(tab => <button key={tab} aria-pressed={mode === tab} onClick={() => { stopCamera(); setMode(tab); setSelected(null); setQuery(""); setMessage(""); }}>{tab === "search" ? "Search foods" : tab === "barcode" ? "Scan barcode" : "Recent foods"}</button>)}</div>
    <div className={s.formFields}><label><span>Add to</span><select value={meal} onChange={e => setMeal(e.target.value as typeof meal)}>{["Breakfast", "Lunch", "Dinner", "Snack"].map(value => <option key={value}>{value}</option>)}</select></label></div>
    {mode !== "recent" && <form className={s.foodSearchForm} onSubmit={e => { e.preventDefault(); void search(mode === "barcode" ? query.trim() : undefined); }}><input aria-label={mode === "barcode" ? "Product barcode" : "Search foods"} placeholder={mode === "barcode" ? "Enter 8–14 barcode digits" : "Try Greek yogurt, oats, or a brand…"} value={query} onChange={e => setQuery(e.target.value)} minLength={mode === "barcode" ? 8 : 2} maxLength={mode === "barcode" ? 14 : 100} pattern={mode === "barcode" ? "[0-9]{8,14}" : undefined} inputMode={mode === "barcode" ? "numeric" : "text"} required /><button className={s.primary} disabled={loading}><FiSearch />{loading ? "Searching…" : "Search"}</button></form>}
    <video ref={video} className={scanning ? s.scannerVideo : s.hiddenVideo} muted playsInline aria-label="Barcode camera preview" />
    {mode === "barcode" && <div className={s.scannerPanel}><FiCamera /><p>Point your camera at the barcode.<small>Camera frames stay on this device. Only the barcode is looked up.</small></p><button className={s.secondary} onClick={scanning ? stopCamera : () => void camera()}>{scanning ? "Stop camera" : "Open camera"}</button></div>}
    {message && <p role="status" className={s.foodNotice}>{message}</p>}
    {mode === "recent" ? <div className={s.foodResults}>{recent.filter(item => item.data.kind === "food").slice(0, 20).map(item => <div className={s.taskRow} key={item.id}><FiCoffee /><div className={s.grow}><strong>{item.data.title}</strong><small>{item.data.kind === "food" ? `${item.data.calories ?? "Unknown"} kcal · same portion` : ""}</small></div><button className={s.secondary} disabled={saving} onClick={async () => { if (item.data.kind !== "food") return; setSaving(true); try { if (await onSave({ ...item.data, date, meal })) onClose(); else setMessage("Could not save this food. Please try again."); } finally { setSaving(false); } }}>Add again</button></div>)}{!recent.some(item => item.data.kind === "food") && <p>Your logged foods will appear here for quick reuse.</p>}</div> : <div className={s.foodResults}>{products.map(product => <button className={`${s.foodResult} ${selected?.barcode === product.barcode ? s.selectedFood : ""}`} key={product.barcode} onClick={() => { setSelected(product); setAmount(100); setUnit(product.basis === "ml" ? "ml" : "g"); }}><span className={`${s.tileIcon} ${s.rose}`}><FiCoffee /></span><span className={s.grow}><strong>{product.title}</strong><small>{product.brand || "Open Food Facts"} · {product.per100.calories ?? "?"} kcal / 100 {product.basis === "unknown" ? "g or ml (check label)" : product.basis}</small></span>{selected?.barcode === product.barcode && <FiCheck />}</button>)}</div>}
    {selected && <form className={s.servingPanel} onSubmit={async e => { e.preventDefault(); if (!nutrients) return; setSaving(true); try { if (await onSave({ kind: "food", title: selected.title, date, meal, ...nutrients, amount, unit, barcode: selected.barcode, source: "openfoodfacts" })) onClose(); else setMessage("Could not save this food. Please try again."); } finally { setSaving(false); } }}><h3>Your portion</h3><small>{selected.serving ? `Package serving: ${selected.serving}. ` : ""}Confirm the package values and whether the basis is grams or millilitres.</small><div className={s.row}><label>Amount<input type="number" aria-label="Portion amount" min="0.1" max="10000" step="0.1" value={amount} onChange={e => setAmount(Number(e.target.value))} required /></label><label>Unit<select aria-label="Portion unit" value={unit} onChange={e => setUnit(e.target.value as "g" | "ml")} disabled={selected.basis !== "unknown"}><option value="g">grams</option><option value="ml">millilitres</option></select></label></div><div className={s.macroChips}>{nutrients && Object.entries(nutrients).map(([name, value]) => <span key={name}><strong>{value ?? "—"}</strong>{name === "calories" ? "kcal" : `${name} (g)`}</span>)}</div><small>“—” means missing data, not zero. Missing nutrients stay unknown in your diary.</small><button type="submit" className={s.primary} disabled={saving || !nutrients}><FiCheck />{saving ? "Saving…" : `Add to ${meal.toLowerCase()}`}</button></form>}
    <div className={s.foodAttribution}><span>Data: <a href="https://world.openfoodfacts.org" target="_blank" rel="noreferrer">Open Food Facts</a> · <a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noreferrer">ODbL</a>. Community data may be incomplete.</span><button className={s.textButton} onClick={() => { onClose(); onManual(); }}>Add food manually</button></div>
  </dialog>;
}
