import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { MapPin, BellRing, Heart } from 'lucide-react';
import { Link } from 'react-router-dom';

const socket = io('http://localhost:5000');

export default function DonorDashboard() {
  const [alert, setAlert] = useState<any>(null);

  useEffect(() => {
    socket.on('emergency_alert', (data) => {
      // Show notification if a broadcast happens
      setAlert(data);
      if ("vibrate" in navigator) {
        navigator.vibrate([200, 100, 200]);
      }
    });

    return () => {
      socket.off('emergency_alert');
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center">
      <div className="w-full max-w-md bg-white min-h-screen shadow-xl relative overflow-hidden flex flex-col">
        <header className="bg-white p-4 flex items-center justify-between border-b border-slate-100 sticky top-0 z-10">
          <div className="flex items-center gap-2">
            <Heart className="text-primary-600 fill-primary-600 w-6 h-6" />
            <h1 className="font-bold text-lg text-slate-800">Donor Presisi</h1>
          </div>
          <Link to="/" className="text-sm font-semibold text-slate-400">Tutup</Link>
        </header>

        <main className="flex-grow flex flex-col items-center justify-center p-6 text-center">
          <div className="w-32 h-32 rounded-full border-2 border-primary-100 bg-primary-50 flex items-center justify-center text-primary-400 relative mb-6">
            <MapPin className="w-10 h-10 z-10 relative text-primary-500" />
            <div className="absolute inset-0 rounded-full border-2 border-primary-300 animate-[ping_3s_cubic-bezier(0,0,0.2,1)_infinite] opacity-50"></div>
          </div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">Radar Aktif</h2>
          <p className="text-slate-500 text-sm px-4">
            Aplikasi sedang memantau kondisi darurat di sekitar Anda. Anda akan menerima notifikasi jika ada pasien yang membutuhkan bantuan.
          </p>
        </main>

        {/* Modal Notifikasi Push */}
        {alert && (
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex flex-col items-center justify-end p-4">
            <div className="bg-white w-full rounded-3xl p-6 shadow-2xl relative overflow-hidden animate-[slideUp_0.3s_ease-out]">
              <div className="absolute top-0 left-0 w-full h-1.5 bg-primary-500 animate-pulse"></div>
              
              <div className="flex items-start gap-4 mb-4 pt-2">
                <div className="w-12 h-12 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center shrink-0">
                  <BellRing className="w-6 h-6 animate-bounce" />
                </div>
                <div>
                  <span className="bg-primary-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest mb-1 inline-block">Darurat</span>
                  <h3 className="font-bold text-slate-800 text-lg leading-tight">Panggilan Donor Darah</h3>
                </div>
              </div>
              
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 mb-6">
                <p className="text-sm text-slate-600 leading-relaxed">
                  Dibutuhkan segera donor darah untuk pasien kritis di Faskes terdekat. Apakah Anda siap membantu?
                </p>
              </div>
              
              <div className="flex gap-3">
                <button onClick={() => setAlert(null)} className="flex-1 py-3.5 rounded-xl font-bold text-sm text-slate-500 bg-slate-100 hover:bg-slate-200">
                  Tidak Bisa
                </button>
                <button onClick={() => { alert('Tiket Digital Diterbitkan!'); setAlert(null); }} className="flex-1 py-3.5 rounded-xl font-bold text-sm text-white bg-primary-600 hover:bg-primary-700 shadow-lg shadow-primary-500/30">
                  Siap Mendonor
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
