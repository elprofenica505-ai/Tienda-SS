'use client';
import React, { useState, useEffect, useRef } from 'react';
import { 
  collection, 
  getDocs, 
  addDoc, 
  updateDoc, 
  doc, 
  serverTimestamp,
  query,
  where,
  orderBy,
  limit
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface Producto {
  id: string;
  codigo: string;
  nombre: string;
  marca: string;
  modelo: string;
  categoria: string;
  stock: number;
  stockMinimo: number;
  precio: number;
  costo: number;
  imagen: string;
}

interface CarritoItem extends Producto {
  cantidadVenta: number;
}

interface Venta {
  id: string;
  total: number;
  items: any[];
  fecha: any;
  estado: string;
  medioPago?: string;
}

interface Entrega {
  id: number;
  cliente: string;
  direccion: string;
  productos: string;
  estado: 'Pendiente' | 'En Ruta' | 'Entregado';
}

export default function TiendaSSApp() {
  const [vistaActual, setVistaActual] = useState<'login' | 'bodega' | 'vendedor' | 'chofer' | 'jefe'>('login');
  const [cargando, setCargando] = useState(true);

  // Login
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');

  // Datos
  const [productos, setProductos] = useState<Producto[]>([]);
  const [vent
