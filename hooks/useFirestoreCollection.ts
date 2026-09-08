'use client';

import { useEffect, useState } from 'react';
import {
  DocumentData,
  onSnapshot,
  Query,
  QuerySnapshot,
  getDocs,
} from 'firebase/firestore';

export type FirestoreCollectionState<T extends DocumentData> = {
  data: QuerySnapshot<T> | null;
  loading: boolean;
  error: Error | null;
};

/**
 * Regla de costo Firestore: getDocs = carga inicial | onSnapshot = solo tiempo real necesario.
 * Este hook ejecuta una consulta una sola vez y no abre un listener persistente.
 */
export function useCollectionOnce<T extends DocumentData>(
  queryRef: Query<T> | null,
  enabled = true,
): FirestoreCollectionState<T> {
  const [state, setState] = useState<FirestoreCollectionState<T>>({ data: null, loading: Boolean(queryRef && enabled), error: null });

  useEffect(() => {
    let cancelled = false;
    if (!queryRef || !enabled) {
      setState({ data: null, loading: false, error: null });
      return () => { cancelled = true; };
    }

    setState((current) => ({ ...current, loading: true, error: null }));
    void getDocs(queryRef)
      .then((snapshot) => {
        if (!cancelled) setState({ data: snapshot, loading: false, error: null });
      })
      .catch((cause: unknown) => {
        if (!cancelled) setState({ data: null, loading: false, error: cause instanceof Error ? cause : new Error('No se pudo cargar la colección.') });
      });

    return () => { cancelled = true; };
  }, [queryRef, enabled]);

  return state;
}

/**
 * Regla de costo Firestore: reservar onSnapshot únicamente para datos que necesitan tiempo real.
 * El cleanup devuelve unsubscribe() al desmontar o cambiar la consulta.
 */
export function useCollectionRealtime<T extends DocumentData>(
  queryRef: Query<T> | null,
  enabled = true,
): FirestoreCollectionState<T> {
  const [state, setState] = useState<FirestoreCollectionState<T>>({ data: null, loading: Boolean(queryRef && enabled), error: null });

  useEffect(() => {
    if (!queryRef || !enabled) {
      setState({ data: null, loading: false, error: null });
      return;
    }

    setState((current) => ({ ...current, loading: true, error: null }));
    const unsubscribe = onSnapshot(
      queryRef,
      (snapshot) => setState({ data: snapshot, loading: false, error: null }),
      (cause) => setState({ data: null, loading: false, error: cause }),
    );

    return unsubscribe;
  }, [queryRef, enabled]);

  return state;
}

export function snapshotRows<T extends DocumentData>(snapshot: QuerySnapshot<T> | null): Array<T & { id: string }> {
  return snapshot?.docs.map((item) => ({ id: item.id, ...item.data() })) || [];
}
