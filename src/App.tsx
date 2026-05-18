import React, { useState, useEffect, useRef } from 'react';
import { 
  Camera, 
  MapPin, 
  Signature, 
  FileText, 
  AlertCircle, 
  CheckCircle2, 
  LogOut, 
  Plus, 
  Search, 
  Trash2,
  ChevronRight,
  Loader2,
  FileDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { QRCodeSVG } from 'qrcode.react';

// --- CONFIGURATION & CONSTANTS ---
const API_CONFIG = {
  // Replace this with your Google Apps Script Web App URL after deployment
  URL: 'https://script.google.com/macros/s/AKfycbyVMJqsUrxLBnDoj-cXiSzmJe5zzEXWjrJOaRDJt0A5-IoImnDWmcGxmIvfN9kh8MP8/exec',
  TOKEN: 'BIOTRASH_TOKEN_2024_SECURE'
};

const ROLES = {
  RECOLECTOR: { 
    user: 'recolector', 
    pass: 'campo2026', 
    label: 'Recolector',
    access: ['capture', 'history']
  },
  SUPERVISOR: { 
    user: 'supervisor', 
    pass: 'super2026', 
    label: 'Supervisor',
    access: ['history']
  },
  ADMIN: { 
    user: 'admin', 
    pass: 'admin2026', 
    label: 'Administrador',
    access: ['capture', 'history', 'edit']
  }
};

const LOGO_URL = 'https://i.ibb.co/vzrQ6vW/logo-biotrash.png';

// --- TYPES ---
interface LocationData {
  lat: number | null;
  lng: number | null;
  alt: number | null;
  accuracy: number | null;
}

interface FormData {
  no_reg: string;
  no_tonel: string;
  nombre_cliente: string;
  producto_componente: string;
  grupo: number;
  proceso_disposicion: 'Desnaturalización' | 'Incineración';
  estado_recipiente: 'Buen Estado' | 'Mal Estado' | 'Presenta Derrame' | 'No Transportable';
  porc_vol_aprox: number;
  galones_aprox: string;
  anomalias_obs: string;
}

// --- UTILS ---
const generateNoReg = () => Math.floor(10000 + Math.random() * 90000).toString();
const generateNoTonel = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let randomStr = '';
  for (let i = 0; i < 4; i++) randomStr += chars.charAt(Math.floor(Math.random() * chars.length));
  const randomNum = Math.floor(10 + Math.random() * 90);
  return `TON${randomStr}${randomNum}`;
};

const toBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
  });

// --- SUB-COMPONENTS ---

const SignaturePad = ({ onSave }: { onSave: (dataUrl: string) => void }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
  }, []);

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDrawing(true);
    draw(e);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    const ctx = canvasRef.current?.getContext('2d');
    ctx?.beginPath();
    if (canvasRef.current) onSave(canvasRef.current.toDataURL());
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = ('touches' in e) ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = ('touches' in e) ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
    onSave('');
  };

  return (
    <div className="space-y-2">
      <canvas
        ref={canvasRef}
        width={600}
        height={200}
        className="w-full h-40 border-2 border-dashed border-gray-300 rounded bg-white touch-none"
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onTouchStart={startDrawing}
        onTouchMove={draw}
        onTouchEnd={stopDrawing}
      />
      <button 
        type="button"
        onClick={clear}
        className="text-xs text-red-600 font-medium px-2 py-1 bg-red-50 rounded hover:bg-red-100"
      >
        Limpiar Firma
      </button>
    </div>
  );
};

// --- MAIN APPLICATION ---

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [view, setView] = useState<'login' | 'dashboard' | 'capture' | 'history'>('login');
  const [loading, setLoading] = useState(false);
  const [records, setRecords] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [formData, setFormData] = useState<FormData>({
    no_reg: '',
    no_tonel: '',
    nombre_cliente: '',
    producto_componente: '',
    grupo: 1,
    proceso_disposicion: 'Desnaturalización',
    estado_recipiente: 'Buen Estado',
    porc_vol_aprox: 0,
    galones_aprox: '',
    anomalias_obs: '',
  });

  const [photos, setPhotos] = useState<{ check: string, etiqueta: string, grupo: string }>({
    check: '',
    etiqueta: '',
    grupo: '',
  });

  const [signature, setSignature] = useState('');
  const [location, setLocation] = useState<LocationData>({ lat: null, lng: null, alt: null, accuracy: null });

  // Load Session
  useEffect(() => {
    const saved = localStorage.getItem('biotrash_session');
    if (saved) {
      const parsed = JSON.parse(saved);
      setUser(parsed);
      setView('dashboard');
    }
    
    // Check GPS
    navigator.geolocation.getCurrentPosition(
      (pos) => setLocation({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        alt: pos.coords.altitude,
        accuracy: pos.coords.accuracy
      }),
      (err) => console.warn('Geolocation error:', err),
      { enableHighAccuracy: true }
    );
  }, []);

  const handleLogin = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const username = data.get('username') as string;
    const password = data.get('password') as string;

    const matchedRole = Object.values(ROLES).find(r => r.user === username && r.pass === password);
    
    if (matchedRole) {
      setUser(matchedRole);
      localStorage.setItem('biotrash_session', JSON.stringify(matchedRole));
      setView('dashboard');
      setError(null);
    } else {
      setError('Credenciales incorrectas');
    }
  };

  const generateNewIDs = () => {
    setFormData(prev => ({
      ...prev,
      no_reg: generateNoReg(),
      no_tonel: generateNoTonel(),
      nombre_cliente: '',
      producto_componente: '',
      anomalias_obs: '',
      porc_vol_aprox: 0,
      galones_aprox: ''
    }));
  };

  const startCapture = () => {
    generateNewIDs();
    setView('capture');
  };

  const compressImage = (file: File, maxWidth = 1200, quality = 0.7): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          if (width > maxWidth) {
            height = (height * maxWidth) / width;
            width = maxWidth;
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
      };
    });
  };

  const handlePhotoUpload = async (key: keyof typeof photos, file: File | null) => {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      alert('La imagen es demasiado pesada (Máximo 20MB)');
      return;
    }
    setLoading(true);
    try {
      // Compress to avoid massive payloads while allowing high-ish quality
      const b64 = await compressImage(file);
      setPhotos(prev => ({ ...prev, [key]: b64 }));
    } catch (err) {
      console.error('Error processing image:', err);
      alert('Error al procesar la imagen');
    } finally {
      setLoading(false);
    }
  };

  const generatePDFBase64 = async () => {
    const pdfElement = document.getElementById('pdf-template');
    if (!pdfElement) return null;
    
    pdfElement.style.display = 'block';
    const canvas = await html2canvas(pdfElement, { 
      scale: 2, 
      logging: false, 
      useCORS: true,
      backgroundColor: '#ffffff'
    });
    pdfElement.style.display = 'none';

    const imgData = canvas.toDataURL('image/jpeg', 0.8);
    const pdf = new jsPDF('p', 'mm', 'letter');
    const width = pdf.internal.pageSize.getWidth();
    const height = (canvas.height * width) / canvas.width;
    pdf.addImage(imgData, 'JPEG', 0, 0, width, height);
    return pdf.output('datauristring');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!photos.check || !photos.etiqueta || !photos.grupo || !signature) {
      alert('Debe completar todas las fotos y la firma antes de enviar.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      console.log('--- Iniciando Proceso de Guardado ---');
      
      console.log('1. Generando PDF...');
      const pdfDataUri = await generatePDFBase64();
      if (!pdfDataUri) {
        throw new Error('Fallo crítico: No se pudo generar el contenido visual del PDF.');
      }
      console.log('PDF generado exitosamente');

      // Helper to strip data:image/...;base64,
      const cleanB64 = (uri: string) => uri.includes(',') ? uri.split(',')[1] : uri;

      const payload = {
        token: API_CONFIG.TOKEN,
        action: 'guardarRegistro',
        driveFolderId: '169xhiKRk2sZ7SJLrzc4lROU40SDolKqJ',
        registro: {
          // IDs and Identification
          no_reg: formData.no_reg,
          cert: formData.no_reg,
          id: formData.no_reg,
          no_tonel: formData.no_tonel,
          tonel: formData.no_tonel,
          fecha: new Date().toISOString(),
          fecha_local: new Date().toLocaleString(),
          timestamp: new Date().toLocaleString(),
          
          // User Info
          usuario: user?.user || 'anon',
          usuario_rol: user?.label || 'Operador',
          operador: user?.user || 'anon',

          // Client and Product
          nombre_cliente: formData.nombre_cliente,
          cliente: formData.nombre_cliente,
          producto: formData.producto_componente,
          producto_componente: formData.producto_componente,
          componente: formData.producto_componente,
          grupo: formData.grupo,

          // Technical Data
          proceso_disposicion: formData.proceso_disposicion,
          proceso: formData.proceso_disposicion,
          disposicion: formData.proceso_disposicion,
          estado_recipiente: formData.estado_recipiente,
          estado: formData.estado_recipiente,
          porc_vol_aprox: formData.porc_vol_aprox,
          porcentaje: formData.porc_vol_aprox,
          galones_aprox: formData.galones_aprox,
          galones: formData.galones_aprox,
          volumen_completo: `${formData.porc_vol_aprox}% (${formData.galones_aprox} Gal)`,
          observaciones: formData.anomalias_obs,
          anomalias_obs: formData.anomalias_obs,

          // Location
          latitud: location.lat,
          longitud: location.lng,
          altitud: location.alt,
          precision_m: location.accuracy,
          coordenadas: `${location.lat}, ${location.lng}`,
          precision: `${location.accuracy}m`,

          // Media (Files)
          fotos: {
            check: cleanB64(photos.check),
            etiqueta: cleanB64(photos.etiqueta),
            grupo: cleanB64(photos.grupo)
          },
          // Flat mapping for photos if needed
          foto_visto_bueno: cleanB64(photos.check),
          foto_etiqueta: cleanB64(photos.etiqueta),
          foto_grupo: cleanB64(photos.grupo),
          
          firma_base64: cleanB64(signature),
          pdf_base64: cleanB64(pdfDataUri),
          
          // Drive Config
          driveFolderId: '169xhiKRk2sZ7SJLrzc4lROU40SDolKqJ',
          token: API_CONFIG.TOKEN
        }
      };

      console.log('2. Enviando a la API Proxy /api/save...');
      const response = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      const resData = await response.json();
      console.log('3. Respuesta recibida:', resData);

      if (!response.ok) {
        throw new Error(`Error del servidor: ${response.status} ${response.statusText}`);
      }

      if (!resData.success) {
        throw new Error(resData.error || 'La API de Google Apps Script devolvió un error desconocido.');
      }
      
      alert('¡TRABAJO GUARDADO EXITOSAMENTE!\nLos datos y el PDF están en la hoja de control.');
      setView('dashboard');
      setPhotos({ check: '', etiqueta: '', grupo: '' });
      setSignature('');
      generateNewIDs();
    } catch (err: any) {
      console.error('ERROR EN CAPTURA:', err);
      setError('ERROR: ' + err.message);
      alert('FALLO AL GUARDAR:\n' + err.message + '\n\nVerifica la consola para más detalles.');
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('biotrash_session');
    setUser(null);
    setView('login');
  };

  // --- RENDERING ---

  if (view === 'login') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-gray border-[12px] border-brand-dark p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md bg-white border-2 border-brand-dark shadow-2xl overflow-hidden"
        >
          <div className="bg-brand-gray/50 p-8 border-b-2 border-brand-dark text-center">
            <img src={LOGO_URL} alt="Biotrash" className="h-20 mx-auto mb-4 object-contain" />
            <h1 className="text-brand-dark text-lg font-bold tracking-tighter uppercase">SISTEMA DE CONTROL BIOTRASH</h1>
            <p className="text-[10px] text-brand-dark/50 font-mono uppercase tracking-widest">Captura de Campo v2.0.4</p>
          </div>
          
          <form onSubmit={handleLogin} className="p-8 space-y-6">
            <div className="space-y-1">
              <label className="tech-label">ID de Operador</label>
              <input 
                name="username"
                type="text" 
                required 
                className="tech-input"
                placeholder="recolector / supervisor / admin"
              />
            </div>
            <div className="space-y-1">
              <label className="tech-label">Clave de Acceso</label>
              <input 
                name="password"
                type="password" 
                required 
                className="tech-input"
              />
            </div>
            {error && (
              <div className="flex items-center gap-2 text-red-600 text-[10px] font-bold uppercase bg-red-50 p-3 border border-red-200">
                <AlertCircle className="w-4 h-4" />
                <span>{error}</span>
              </div>
            )}
            <button 
              type="submit"
              className="w-full py-4 bg-brand-green text-white font-bold text-xs uppercase tracking-widest hover:bg-brand-blue transition-colors"
            >
              Autenticar Servicio
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen h-screen flex flex-col bg-brand-gray border-[12px] border-brand-dark overflow-hidden select-none">
      {/* HEADER BAR */}
      <header className="flex justify-between items-center bg-white border-b border-brand-dark px-6 py-3 shrink-0">
        <div className="flex items-center space-x-4">
          <img 
            src={LOGO_URL} 
            alt="Biotrash" 
            className="h-10 cursor-pointer object-contain" 
            onClick={() => setView('dashboard')} 
          />
          <div className="leading-none">
            <h1 className="text-lg font-bold tracking-tighter text-brand-dark">BIOTRASH CONTROL</h1>
            <p className="text-[10px] text-brand-dark/60 font-mono uppercase tracking-widest">Instancia Biotrash - Captura v2.0.4</p>
          </div>
        </div>
        <div className="flex items-center space-x-6 text-right">
          <div className="hidden md:block leading-none">
            <p className="text-[10px] uppercase text-brand-dark/50 mb-1">Sesión Activa</p>
            <p className="text-xs font-mono text-brand-dark">{user?.user} [{user?.label.toUpperCase()}]</p>
          </div>
          <button 
            onClick={logout}
            className="px-4 py-2 border border-brand-dark hover:bg-brand-dark hover:text-white text-[10px] uppercase tracking-widest font-bold transition-all text-brand-dark"
          >
            Cerrar Sesión
          </button>
        </div>
      </header>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          {view === 'dashboard' && (
            <motion.div 
              key="dashboard"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="h-full grid grid-cols-1 md:grid-cols-2 gap-0"
            >
              <div className="flex flex-col items-center justify-center p-12 border-r border-brand-dark/20 space-y-6">
                <div className="text-center space-y-2">
                  <h2 className="text-4xl font-bold tracking-tighter text-brand-dark">CENTRO DE OPERACIONES</h2>
                  <p className="text-xs font-mono uppercase opacity-50 tracking-widest">Seleccione una acción para proceder</p>
                </div>
                
                <div className="grid grid-cols-2 gap-4 w-full max-w-sm">
                  {user?.access.includes('capture') && (
                    <button 
                      onClick={startCapture}
                      className="aspect-square border border-brand-dark p-6 flex flex-col items-center justify-center gap-3 hover:bg-brand-dark hover:text-white transition-all group"
                    >
                      <Plus className="w-8 h-8 group-hover:scale-110 transition-transform" />
                      <span className="text-[10px] font-bold uppercase tracking-widest">NUEVA REC.</span>
                    </button>
                  )}
                  <button 
                    onClick={() => setView('history')}
                    className="aspect-square border border-brand-dark p-6 flex flex-col items-center justify-center gap-3 hover:bg-brand-dark hover:text-white transition-all group"
                  >
                    <Search className="w-8 h-8 group-hover:scale-110 transition-transform" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">HISTORIAL</span>
                  </button>
                </div>
              </div>
              
              <div className="hidden md:flex flex-col bg-brand-gray/20 p-12 items-center justify-center text-center">
                <div className="p-8 border border-brand-dark border-dashed opacity-30 select-none">
                  <img src={LOGO_URL} alt="Logo Background" className="h-24 grayscale opacity-30" />
                  <p className="text-xs font-mono mt-4 uppercase text-brand-dark">ENLACE SEGURO BIOTRASH</p>
                  <p className="text-[8px] font-mono mt-1 opacity-50 text-brand-dark">TXID: {Math.random().toString(16).substring(2, 12)}</p>
                </div>
              </div>
            </motion.div>
          )}

          {view === 'capture' && (
            <motion.div 
              key="capture"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="h-full grid grid-cols-1 md:grid-cols-12 gap-0 overflow-hidden"
            >
              {/* LEFT: INFO */}
              <section className="col-span-3 border-r border-brand-dark flex flex-col bg-white/40 hidden md:flex">
                <div className="panel-header">
                  <h2 className="text-[11px] font-mono italic opacity-70 uppercase">IDs Generados</h2>
                </div>
                <div className="p-6 space-y-8 flex-1">
                  <div className="space-y-1">
                    <label className="tech-label">NO_REG (Registro)</label>
                    <p className="text-4xl font-mono font-bold text-brand-dark">{formData.no_reg}</p>
                  </div>
                  <div className="space-y-1">
                    <label className="tech-label">Folio (Tonel)</label>
                    <p className="text-2xl font-mono text-brand-orange">{formData.no_tonel}</p>
                  </div>
                  <div className="pt-8">
                    <div className="p-4 bg-brand-green/10 border border-brand-green text-brand-green rounded">
                      <p className="text-[10px] font-bold uppercase mb-1">Estado</p>
                      <p className="text-xs font-mono">✓ SINCRONIZACIÓN ACTIVA</p>
                      <p className="text-[9px] opacity-70 mt-2 font-mono uppercase truncate">ID: {API_CONFIG.TOKEN}</p>
                    </div>
                  </div>
                </div>
                <div className="p-4 border-t border-brand-dark flex flex-col items-center">
                  <QRCodeSVG value={`https://biotrash.net/validate?id=${formData.no_reg}`} size={80} className="opacity-40 mix-blend-multiply" />
                   <p className="text-[9px] mt-2 opacity-50 uppercase tracking-widest text-center">QR del PDF en Vivo</p>
                </div>
              </section>

              {/* MIDDLE: FORM */}
              <section className="col-span-1 md:col-span-5 border-r border-brand-dark flex flex-col bg-white overflow-y-auto">
                <div className="panel-header sticky top-0 z-10">
                  <h2 className="text-xs font-bold uppercase tracking-widest">Captura de Datos</h2>
                  <span className="text-[10px] text-red-500 font-bold uppercase animate-pulse">Obligatorio *</span>
                </div>
                
                <form id="capture-form" onSubmit={handleSubmit} className="p-6 space-y-6 text-brand-dark">
                  <div className="space-y-1">
                    <label className="tech-label">Nombre del Cliente *</label>
                    <input 
                      required
                      type="text" 
                      className="tech-input text-brand-dark"
                      value={formData.nombre_cliente}
                      onChange={(e) => setFormData({...formData, nombre_cliente: e.target.value})}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="tech-label">PRODUCTO *</label>
                    <input 
                      required
                      type="text" 
                      className="tech-input text-brand-dark"
                      placeholder="Ej. Aceite usado, Baterías, etc."
                      value={formData.producto_componente}
                      onChange={(e) => setFormData({...formData, producto_componente: e.target.value})}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="tech-label">Grupo (1-10)</label>
                      <select 
                        className="tech-input text-brand-dark"
                        value={formData.grupo}
                        onChange={(e) => setFormData({...formData, grupo: parseInt(e.target.value)})}
                      >
                        {[1,2,3,4,5,6,7,8,9,10].map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="tech-label">Proceso Disposición</label>
                      <select 
                        className="tech-input text-brand-dark"
                        value={formData.proceso_disposicion}
                        onChange={(e: any) => setFormData({...formData, proceso_disposicion: e.target.value})}
                      >
                        <option>Desnaturalización</option>
                        <option>Incineración</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="tech-label">Estado Recipiente</label>
                      <select 
                        className="tech-input text-brand-dark"
                        value={formData.estado_recipiente}
                        onChange={(e: any) => setFormData({...formData, estado_recipiente: e.target.value})}
                      >
                        <option>Buen Estado</option>
                        <option>Mal Estado</option>
                        <option>Presenta Derrame</option>
                        <option>No Transportable</option>
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                       <div className="space-y-1">
                        <label className="tech-label">% Vol.</label>
                        <input 
                          type="number" className="tech-input text-brand-dark"
                          value={formData.porc_vol_aprox || ''}
                          onChange={(e) => setFormData({...formData, porc_vol_aprox: parseInt(e.target.value) || 0})}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="tech-label">Galones</label>
                        <input 
                          type="text" className="tech-input text-brand-dark"
                          value={formData.galones_aprox}
                          onChange={(e) => setFormData({...formData, galones_aprox: e.target.value})}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="tech-label">Observaciones Adicionales</label>
                    <textarea 
                      className="tech-input text-brand-dark h-24 resize-none"
                      value={formData.anomalias_obs}
                      onChange={(e) => setFormData({...formData, anomalias_obs: e.target.value})}
                      placeholder="Escriba anomalías u observaciones aquí..."
                    />
                  </div>
                </form>
              </section>

              {/* RIGHT: MEDIA */}
              <section className="col-span-1 md:col-span-4 flex flex-col bg-brand-gray/30 overflow-y-auto">
                <div className="panel-header bg-brand-dark">
                  <h2 className="text-xs font-bold uppercase tracking-widest">Evidencia Digital</h2>
                  <span className="text-[10px] opacity-60">SENSORES: ON</span>
                </div>
                <div className="p-4 flex-1 flex flex-col space-y-4">
                  {/* PHOTOS */}
                  <div className="grid grid-cols-3 gap-2">
                    {(['check', 'etiqueta', 'grupo'] as const).map((key) => (
                      <div key={key} className="relative aspect-square bg-white border border-brand-dark flex flex-col items-center justify-center p-2 group hover:bg-brand-gray cursor-pointer">
                        {photos[key] ? (
                          <>
                            <img src={photos[key]} className="absolute inset-0 w-full h-full object-cover p-1" alt={key} />
                            <div className="absolute top-1 right-1 bg-green-500 w-2 h-2 rounded-full ring-2 ring-white"></div>
                          </>
                        ) : (
                          <>
                            <Camera className="w-5 h-5 mb-1 opacity-40 shrink-0" />
                            <span className="text-[8px] font-bold uppercase text-center">{key === 'check' ? 'VISTO BUENO' : key === 'etiqueta' ? 'ETIQUETA' : 'GRUPO'}</span>
                          </>
                        )}
                        <input 
                          type="file" accept="image/*" capture="environment" 
                          className="absolute inset-0 opacity-0 cursor-pointer"
                          onChange={(e) => handlePhotoUpload(key, e.target.files?.[0] || null)}
                        />
                      </div>
                    ))}
                  </div>

                  {/* SIGNATURE */}
                  <div className="flex-1 flex flex-col space-y-1 min-h-[150px]">
                    <label className="tech-label">Autorización Firmada Manualmente</label>
                    <div className="flex-1 border border-brand-dark bg-white relative">
                       <div className="absolute inset-0 flex items-center justify-center opacity-5 pointer-events-none">
                          <p className="font-mono text-xl uppercase font-bold transform -rotate-12">Panel de Firma Digital</p>
                       </div>
                       <div className="absolute inset-0">
                         <SignaturePad onSave={setSignature} />
                       </div>
                    </div>
                  </div>
                  
                  {loading && (
                    <div className="p-4 bg-brand-orange text-white text-center font-bold text-[10px] animate-pulse uppercase">
                      GENERANDO PDF Y SINCRONIZANDO...
                    </div>
                  )}
                </div>
              </section>
            </motion.div>
          )}

          {view === 'history' && (
            <motion.div 
              key="history"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="h-full flex flex-col"
            >
              <div className="panel-header">
                <h2 className="text-xs font-bold uppercase tracking-widest">Explorador de Archivo</h2>
                <button onClick={() => setView('dashboard')} className="text-[10px] hover:underline">Volver al Escritorio</button>
              </div>
              <div className="flex-1 p-12 bg-white/50 flex items-center justify-center text-center">
                 <div className="max-w-md space-y-4">
                    <FileDown className="w-16 h-16 mx-auto opacity-10" />
                    <h3 className="text-xl font-bold tracking-tighter">ENLACE A HOJA DE CONTROL</h3>
                    <p className="text-xs opacity-60">Los datos históricos se sincronizan directamente con la hoja de cálculo maestra.</p>
                    <a 
                      href="https://docs.google.com/spreadsheets/d/1cWmTWDTA-fyRGEuBVtUjstc6IuPXppfaTM2xvP-RFfM/edit?usp=sharing" 
                      target="_blank" rel="noreferrer"
                      className="inline-block px-8 py-3 bg-brand-dark text-white text-xs font-bold uppercase tracking-widest hover:bg-brand-orange transition-all"
                    >
                      Abrir Registro Maestro
                    </a>
                 </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* FOOTER STATUS BAR */}
      <footer className="bg-brand-dark text-white px-6 py-2 flex justify-between items-center border-t border-white/10 shrink-0">
        <div className="flex space-x-8 overflow-hidden">
          <div className="flex items-center space-x-2 shrink-0">
            <div className={`w-2 h-2 rounded-full ${location.lat ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`}></div>
            <p className="text-[9px] font-mono opacity-80 uppercase">
              {location.lat ? `GPS: ${location.lat.toFixed(4)}, ${location.lng?.toFixed(4)} | Precisión: ${location.accuracy?.toFixed(1)}m` : 'SENSOR GPS: BUSCANDO SEÑAL...'}
            </p>
          </div>
          <p className="text-[9px] font-mono opacity-40 uppercase hidden sm:block">CONEXIÓN: GOOGLE_CLOUD_VITE_v6</p>
        </div>
        <div className="flex space-x-3">
          {view === 'capture' && (
              <button 
                form="capture-form"
                type="submit"
                disabled={loading}
                className="px-6 py-2 bg-brand-green text-white font-bold text-xs uppercase tracking-tighter hover:bg-brand-blue transition-colors flex items-center gap-2"
              >
                {loading ? <Loader2 className="w-3 h-3 animate-spin"/> : <CheckCircle2 className="w-3 h-3"/>}
                PDF Y SINCRONIZAR
              </button>
          )}
        </div>
      </footer>

      {/* --- PDF TEMPLATE (Hidden) --- */}
      <div 
        id="pdf-template" 
        style={{ display: 'none', width: '800px', padding: '40px', backgroundColor: '#fff', color: '#000', fontFamily: 'Arial, sans-serif' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
          <img src={LOGO_URL} crossOrigin="anonymous" alt="Biotrash Logo" style={{ height: '60px', objectFit: 'contain' }} />
          <div style={{ textAlign: 'right' }}>
            <h1 style={{ margin: 0, color: '#8CC63F', fontSize: '24px' }}>ACTA DE RECOLECCIÓN</h1>
            <p style={{ margin: 0, fontWeight: 'bold' }}>CERT: #{formData.no_reg}</p>
            <p style={{ margin: 0, fontSize: '10px', color: '#666' }}>{new Date().toLocaleString()}</p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '30px' }}>
          <div style={{ border: '1px solid #8CC63F', padding: '15px' }}>
            <h3 style={{ backgroundColor: '#8CC63F', color: '#fff', padding: '5px 10px', marginTop: 0, fontSize: '12px' }}>DATOS DEL CLIENTE</h3>
            <p style={{ fontSize: '12px' }}><strong>CLIENTE:</strong> {formData.nombre_cliente}</p>
            <p style={{ fontSize: '12px' }}><strong>NO. TONEL:</strong> {formData.no_tonel}</p>
            <p style={{ fontSize: '12px' }}><strong>GRUPO:</strong> {formData.grupo}</p>
          </div>
          <div style={{ border: '1px solid #8CC63F', padding: '15px' }}>
            <h3 style={{ backgroundColor: '#8CC63F', color: '#fff', padding: '5px 10px', marginTop: 0, fontSize: '12px' }}>DETALLE TÉCNICO</h3>
            <p style={{ fontSize: '12px' }}><strong>PRODUCTO:</strong> {formData.producto_componente}</p>
            <p style={{ fontSize: '12px' }}><strong>ESTADO:</strong> {formData.estado_recipiente}</p>
            <p style={{ fontSize: '12px' }}><strong>PROCESO:</strong> {formData.proceso_disposicion}</p>
            <p style={{ fontSize: '12px' }}><strong>VOLUMEN:</strong> {formData.porc_vol_aprox}% ({formData.galones_aprox} Gal)</p>
          </div>
        </div>

        <div style={{ marginBottom: '30px' }}>
           <h3 style={{ borderBottom: '2px solid #8CC63F', paddingBottom: '5px', fontSize: '12px', color: '#0071BC' }}>EVIDENCIA FOTOGRÁFICA</h3>
           <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
              {photos.check && <div style={{ border: '1px solid #141414', padding: '2px' }}><img src={photos.check} style={{ width: '100%' }} /><p style={{ fontSize: '8px', textAlign: 'center', margin: '2px' }}>VISTO BUENO</p></div>}
              {photos.etiqueta && <div style={{ border: '1px solid #141414', padding: '2px' }}><img src={photos.etiqueta} style={{ width: '100%' }} /><p style={{ fontSize: '8px', textAlign: 'center', margin: '2px' }}>ETIQUETA</p></div>}
              {photos.grupo && <div style={{ border: '1px solid #141414', padding: '2px' }}><img src={photos.grupo} style={{ width: '100%' }} /><p style={{ fontSize: '8px', textAlign: 'center', margin: '2px' }}>GRUPO/LOTE</p></div>}
           </div>
        </div>

        <div style={{ marginBottom: '30px' }}>
          <h3 style={{ borderBottom: '2px solid #8CC63F', paddingBottom: '5px', fontSize: '12px', color: '#0071BC' }}>OBSERVACIONES DEL OPERADOR</h3>
          <p style={{ minHeight: '60px', border: '1px solid #eee', padding: '10px', fontSize: '11px', fontStyle: 'italic' }}>{formData.anomalias_obs || 'N/A'}</p>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '50px' }}>
          <div style={{ textAlign: 'center' }}>
             {signature && <img src={signature} style={{ width: '180px', borderBottom: '2px solid #0071BC' }} />}
             <p style={{ margin: 0, fontWeight: 'bold', fontSize: '12px', color: '#0071BC' }}>{user?.user.toUpperCase()}</p>
             <p style={{ margin: 0, fontSize: '9px', opacity: 0.6 }}>Firma del Operador</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <QRCodeSVG value={`https://biotrash.net/validate?id=${formData.no_reg}`} size={80} />
            <p style={{ fontSize: '7px', color: '#888', marginTop: '5px' }}>PROTOCOLO DE VALIDACIÓN REQ.</p>
          </div>
        </div>

        <div style={{ marginTop: '30px', fontSize: '8px', color: '#aaa', borderTop: '1px solid #eee', paddingTop: '10px', fontFamily: 'monospace' }}>
           LOC: {location.lat}, {location.lng} | PREC: {location.accuracy}M | APP_HASH: {Math.random().toString(16).substring(2, 8)}<br/>
           BIOTRASH S.A. © 2026 - REGISTRO DE GESTIÓN DE RESIDUOS PELIGROSOS
        </div>
      </div>
    </div>
  );
}

