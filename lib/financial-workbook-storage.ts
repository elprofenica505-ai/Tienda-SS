'use client';

import { createFinancialWorkbook, type FinancialWorkbookData } from '@/lib/financial-workbook';

type FileSystemWritableLike = {
  write: (data: Blob) => Promise<void>;
  close: () => Promise<void>;
  abort?: () => Promise<void>;
};

type FileSystemFileHandleLike = {
  name?: string;
  kind?: 'file';
  requestPermission?: (options: { mode: 'readwrite' }) => Promise<PermissionState>;
  queryPermission?: (options: { mode: 'readwrite' }) => Promise<PermissionState>;
  createWritable: () => Promise<FileSystemWritableLike>;
};

type SavePickerWindow = Window & {
  showSaveFilePicker?: (options: {
    suggestedName: string;
    types: Array<{ description: string; accept: Record<string, string[]> }>;
  }) => Promise<FileSystemFileHandleLike>;
};

type WorkbookTarget = { kind: 'file'; handle: FileSystemFileHandleLike } | { kind: 'download' } | { kind: 'cancelled' };

const DATABASE_NAME = 'tienda-ss-master-workbook';
const STORE_NAME = 'file-handles';
const handles = new Map<string, FileSystemFileHandleLike | null>();
let databasePromise: Promise<IDBDatabase> | null = null;

function fileNameForTenant(tenantName: string): string {
  const safeName = tenantName.replace(/[\\/:*?"<>|]+/g, ' ').trim().replace(/\s+/g, '-').slice(0, 64) || 'Empresa';
  return `TiendaSS-${safeName}.xlsx`;
}

function openHandleDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise;
  const opening = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('INDEXED_DB_NOT_AVAILABLE'));
      return;
    }
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('INDEXED_DB_OPEN_FAILED'));
  }).catch((error) => {
    databasePromise = null;
    throw error;
  });
  databasePromise = opening;
  return opening;
}

async function storedHandle(tenantId: string): Promise<FileSystemFileHandleLike | null> {
  const database = await openHandleDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).get(tenantId);
    request.onsuccess = () => resolve((request.result as FileSystemFileHandleLike | undefined) || null);
    request.onerror = () => reject(request.error || new Error('INDEXED_DB_READ_FAILED'));
  });
}

async function rememberHandle(tenantId: string, handle: FileSystemFileHandleLike): Promise<void> {
  handles.set(tenantId, handle);
  try {
    const database = await openHandleDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put(handle, tenantId);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('INDEXED_DB_WRITE_FAILED'));
      transaction.onabort = () => reject(transaction.error || new Error('INDEXED_DB_WRITE_ABORTED'));
    });
  } catch {
    // The in-memory handle still works for this visit; the next visit may ask again.
  }
}

/** Preloads a previously selected workbook before the user taps the update button. */
export async function prepareMasterWorkbookHandle(tenantId: string): Promise<void> {
  if (handles.has(tenantId)) return;
  try {
    handles.set(tenantId, await storedHandle(tenantId));
  } catch {
    handles.set(tenantId, null);
  }
}

async function chooseWorkbookTarget(tenantId: string, tenantName: string): Promise<WorkbookTarget> {
  if (!handles.has(tenantId)) await prepareMasterWorkbookHandle(tenantId);
  const existingHandle = handles.get(tenantId);
  if (existingHandle) {
    try {
      const permission = existingHandle.requestPermission
        ? await existingHandle.requestPermission({ mode: 'readwrite' })
        : existingHandle.queryPermission
          ? await existingHandle.queryPermission({ mode: 'readwrite' })
          : 'granted';
      if (permission === 'granted') return { kind: 'file', handle: existingHandle };
    } catch {
      // Continue with a normal download if the browser no longer allows the saved handle.
    }
    return { kind: 'download' };
  }

  const picker = (window as SavePickerWindow).showSaveFilePicker;
  if (!picker) return { kind: 'download' };
  try {
    // Open the save dialog before any network request, while the tap still counts
    // as a direct user gesture on browsers that enforce this requirement.
    const handle = await picker({
      suggestedName: fileNameForTenant(tenantName),
      types: [{
        description: 'Libro de Excel',
        accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] },
      }],
    });
    await rememberHandle(tenantId, handle);
    return { kind: 'file', handle };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return { kind: 'cancelled' };
    return { kind: 'download' };
  }
}

function downloadWorkbook(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

async function writeExistingWorkbook(handle: FileSystemFileHandleLike, blob: Blob): Promise<boolean> {
  let writable: FileSystemWritableLike | null = null;
  try {
    writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return true;
  } catch {
    try { await writable?.abort?.(); } catch { /* no-op */ }
    return false;
  }
}

export type MasterWorkbookResult = { kind: 'updated' | 'downloaded'; message: string };

export class FinancialWorkbookExportError extends Error {
  code?: string;
  status?: number;
  resetAt?: string;
  timeZone?: string;

  constructor(message: string, options: { code?: string; status?: number; resetAt?: string; timeZone?: string } = {}) {
    super(message);
    this.name = 'FinancialWorkbookExportError';
    this.code = options.code;
    this.status = options.status;
    this.resetAt = options.resetAt;
    this.timeZone = options.timeZone;
  }
}

export async function updateMasterWorkbook(options: {
  tenantId: string;
  tenantName: string;
  token: string | (() => Promise<string>);
}): Promise<MasterWorkbookResult> {
  const fileName = fileNameForTenant(options.tenantName);
  const target = await chooseWorkbookTarget(options.tenantId, options.tenantName);
  if (target.kind === 'cancelled') throw new FinancialWorkbookExportError('Cancelaste la selección del archivo; no se hizo ninguna exportación.');

  // Resolve credentials after the save picker/permission request so that the
  // browser's transient user activation is still available to the file API.
  const token = typeof options.token === 'function' ? await options.token() : options.token;
  const response = await fetch('/api/reports/workbook', {
    headers: { Authorization: `Bearer ${token}`, 'x-tenant-id': options.tenantId },
    cache: 'no-store',
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    throw new FinancialWorkbookExportError(String(payload.error || 'No se pudo preparar el Excel maestro.'), {
      code: typeof payload.code === 'string' ? payload.code : undefined,
      status: response.status,
      resetAt: typeof payload.resetAt === 'string' ? payload.resetAt : undefined,
      timeZone: typeof payload.timezone === 'string' ? payload.timezone : undefined,
    });
  }

  const data = await response.json() as FinancialWorkbookData;
  const workbook = createFinancialWorkbook(data);
  if (target.kind === 'file') {
    const updated = await writeExistingWorkbook(target.handle, workbook);
    if (updated) return { kind: 'updated', message: `Archivo maestro actualizado: ${target.handle.name || fileName}.` };
  }

  downloadWorkbook(workbook, fileName);
  return {
    kind: 'downloaded',
    message: 'Tu navegador no permitió actualizar un archivo guardado. Se descargó el Excel maestro; puedes reemplazar el archivo anterior con esta copia.',
  };
}
