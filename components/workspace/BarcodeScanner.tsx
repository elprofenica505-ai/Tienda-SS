'use client';

import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';
import { useEffect, useRef, useState } from 'react';

type Props = { open: boolean; title?: string; onDetected: (value: string) => void; onClose: () => void };

export function BarcodeScanner({ open, title = 'Escanear código de barras', onDetected, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const detectedRef = useRef(onDetected);
  const closeRef = useRef(onClose);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const [manual, setManual] = useState('');
  const [status, setStatus] = useState('Listo para abrir la cámara.');
  const [starting, setStarting] = useState(false);

  detectedRef.current = onDetected;
  closeRef.current = onClose;

  function stopCamera() {
    controlsRef.current?.stop();
    controlsRef.current = null;
    const stream = videoRef.current?.srcObject;
    if (stream instanceof MediaStream) stream.getTracks().forEach((track) => track.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  async function startCamera() {
    if (!videoRef.current || starting) return;
    setStarting(true);
    setStatus('Solicitando permiso para usar la cámara…');
    stopCamera();
    try {
      const reader = readerRef.current || new BrowserMultiFormatReader();
      readerRef.current = reader;
      controlsRef.current = await reader.decodeFromConstraints({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }, videoRef.current, (result, error) => {
        if (result) { detectedRef.current(result.getText()); stopCamera(); closeRef.current(); return; }
        if (error && !String(error).includes('NotFoundException')) setStatus('Alinea el código dentro del rectángulo.');
      });
      setStatus('Alinea el código dentro del rectángulo.');
    } catch (error) {
      const reason = error instanceof DOMException && error.name === 'NotAllowedError' ? 'Permiso de cámara bloqueado. Actívalo en el candado del navegador y pulsa Reintentar.' : 'No se pudo abrir la cámara. Puedes elegir una foto del código o escribirlo manualmente.';
      setStatus(reason);
    } finally { setStarting(false); }
  }

  async function decodeImage(file: File | undefined) {
    if (!file) return;
    setStatus('Analizando la foto del código…');
    const imageUrl = URL.createObjectURL(file);
    try {
      const reader = readerRef.current || new BrowserMultiFormatReader();
      readerRef.current = reader;
      const result = await reader.decodeFromImageUrl(imageUrl);
      detectedRef.current(result.getText()); stopCamera(); closeRef.current();
    } catch { setStatus('No encontré un código legible en esa foto. Prueba con más luz o usa entrada manual.'); }
    finally { URL.revokeObjectURL(imageUrl); }
  }

  useEffect(() => {
    if (!open) { stopCamera(); return undefined; }
    setManual('');
    void startCamera();
    return () => stopCamera();
    // La cámara debe iniciar una sola vez por apertura del modal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;
  return <div className="modal-backdrop barcode-scanner-backdrop" role="dialog" aria-modal="true" aria-label={title}><div className="barcode-scanner-modal"><div className="barcode-scanner-header"><div><div className="eyebrow">Lector móvil</div><h2>{title}</h2></div><button className="modal-close" type="button" onClick={onClose}>×</button></div><div className="barcode-camera"><video ref={videoRef} muted playsInline /><div className="barcode-frame" aria-hidden="true" /></div><p className="barcode-scanner-status">{status}</p><div className="barcode-scanner-actions"><button className="button button-secondary" type="button" onClick={() => void startCamera()} disabled={starting}>{starting ? 'Abriendo cámara…' : 'Reintentar cámara'}</button><label className="button button-quiet">Elegir foto<input type="file" accept="image/*" onChange={(event) => void decodeImage(event.target.files?.[0])} hidden /></label></div><div className="barcode-manual"><label>Código manual o lector USB<input autoFocus value={manual} onChange={(event) => setManual(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && manual.trim()) { detectedRef.current(manual.trim()); closeRef.current(); } }} placeholder="Escanea o escribe aquí" /></label><button className="button" type="button" disabled={!manual.trim()} onClick={() => { detectedRef.current(manual.trim()); closeRef.current(); }}>Usar código</button></div></div></div>;
}
