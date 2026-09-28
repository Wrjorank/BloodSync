import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { Droplet, Activity, Heart, UserPlus } from 'lucide-react';
import FaskesDashboard from './pages/FaskesDashboard';
import DonorDashboard from './pages/DonorDashboard';
import PatientForm from './pages/PatientForm';

function Home() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
      <div className="max-w-4xl w-full text-center">
        <Droplet className="w-24 h-24 text-primary-600 fill-primary-600 mx-auto mb-6" />
        <h1 className="text-5xl font-extrabold text-slate-900 mb-4 tracking-tight">
          BloodSync <span className="text-primary-600">ID</span>
        </h1>
        <p className="text-lg text-slate-600 mb-12">
          Sistem Logistik Darah & Notifikasi Presisi (Tema Merah Putih)
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Link to="/faskes" className="bg-white p-8 rounded-3xl shadow-sm hover:shadow-xl hover:border-primary-200 border border-transparent transition-all group">
            <Activity className="w-12 h-12 text-primary-600 mb-4 mx-auto group-hover:scale-110 transition-transform" />
            <h2 className="text-2xl font-bold mb-2 group-hover:text-primary-600">Faskes / PMI</h2>
            <p className="text-slate-500">Dasbor kontrol dan validasi permintaan.</p>
          </Link>
          <Link to="/pasien" className="bg-white p-8 rounded-3xl shadow-sm hover:shadow-xl hover:border-primary-200 border border-transparent transition-all group">
            <UserPlus className="w-12 h-12 text-primary-600 mb-4 mx-auto group-hover:scale-110 transition-transform" />
            <h2 className="text-2xl font-bold mb-2 group-hover:text-primary-600">Pasien</h2>
            <p className="text-slate-500">Ajukan kebutuhan darah darurat secara cepat.</p>
          </Link>
          <Link to="/donor" className="bg-white p-8 rounded-3xl shadow-sm hover:shadow-xl hover:border-primary-200 border border-transparent transition-all group">
            <Heart className="w-12 h-12 text-primary-600 mb-4 mx-auto group-hover:scale-110 transition-transform" />
            <h2 className="text-2xl font-bold mb-2 group-hover:text-primary-600">Pendonor</h2>
            <p className="text-slate-500">Aplikasi mobile dengan notifikasi presisi.</p>
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/faskes" element={<FaskesDashboard />} />
        <Route path="/donor" element={<DonorDashboard />} />
        <Route path="/pasien" element={<PatientForm />} />
      </Routes>
    </BrowserRouter>
  );
}
