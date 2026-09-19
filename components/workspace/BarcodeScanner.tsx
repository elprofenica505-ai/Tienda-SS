'use client';

import { useEffect, useRef, useState } from 'react';

type Props = { open: boolean; title?: string; onDetected: (value: string) => void; onClose: () => void };

type Detector = { detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>> };

declare global { interface Window { BarcodeDetector?: new (options?: { formats?: string[] }) => Detector } }

export function BarcodeScanner({ open, title = 'Escanear código de barras', onDetected, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const detectedRef = useRef(onDetected);
  const closeRef = useRef(onClose);
  const [manual, setManual] = useState('');
  const [status, setStatus] = useState('Solicitando cámara…');
  detectedRef.current = onDetected;
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    const stop = () => { if (timerRef.current) window.clearTimeout(timerRef.current); timerRef.current = null; streamRef.current?.getTracks().forEach((track) => track.stop()); streamRef.current = null; };
    const scan = async () => {
      if (cancelled || !videoRef.current) return;
      const Detector = window.BarcodeDetector;
      if (!Detector) { setStatus('Este navegador no ofrece escaneo automático. Escribe el código o usa un lector USB.'); return; }
      try {
        const detector = new Detector({ formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e'] });
        const found = await detector.detect(videoRef.current);
        const value = found.find((item) => item.rawValue)?.rawValue;
        if (value) { detectedRef.current(value); stop(); closeRef.current(); return; }
      } catch { setStatus('Acerca el código al encuadre y mantén el teléfono estable.'); }
      timerRef.current = window.setTimeout(() => void scan(), 300);
    };
    void (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('CAMERA_UNAVAILABLE');
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
        if (cancelled || !videoRef.current) { stream.getTracks().forEach((track) => track.stop()); return; }
        streamRef.current = stream; videoRef.current.srcObject = stream; await videoRef.current.play(); setStatus('Alinea el código dentro del rectángulo.'); void scan();
      } catch { setStatus('No se pudo abrir la cámara. Revisa el permiso o escribe el código manualmente.'); }
    })();
    return () => { cancelled = true; stop(); };
  }, [open]);

  if (!open) return null;
  return <div className="modal-backdrop barcode-scanner-backdrop" role="dialog" aria-modal="true" aria-label={title}><div className="barcode-scanner-modal"><div className="barcode-scanner-header"><div><div className="eyebrow">Lector móvil</div><h2>{title}</h2></div><button className="modal-close" type="button" onClick={onClose}>×</button></div><div className="barcode-camera"><video ref={videoRef} muted playsInline /><div className="barcode-frame" aria-hidden="true" /></div><p className="barcode-scanner-status">{status}</p><div className="barcode-manual"><label>Código manual o lector USB<input autoFocus value={manual} onChange={(event) => setManual(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && manual.trim()) { detectedRef.current(manual.trim()); closeRef.current(); } }} placeholder="Escanea o escribe aquí" /></label><button className="button" type="button" disabled={!manual.trim()} onClick={() => { detectedRef.current(manual.trim()); closeRef.current(); }}>Usar código</button></div></div></div>;
}
