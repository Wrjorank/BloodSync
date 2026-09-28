import { useState } from 'react';
import { api } from '../services/api';
import { Send, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function PatientForm() {
  const [formData, setFormData] = useState({
    patientName: '',
    bloodType: 'A+',
    bagsNeeded: 1,
    faskesId: 'RSUD-01'
  });
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/requests', formData);
      setSubmitted(true);
    } catch (err) {
      console.error(err);
      alert('Gagal mengirim pengajuan. Pastikan form valid dan backend berjalan.');
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white p-8 rounded-3xl shadow-lg text-center max-w-md w-full">
          <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6 text-3xl font-bold">✓</div>
          <h2 className="text-2xl font-bold text-slate-800 mb-2">Pengajuan Berhasil!</h2>
          <p className="text-slate-500 mb-8">Petugas Faskes sedang meninjau permintaan Anda. Mohon tunggu notifikasi selanjutnya.</p>
          <Link to="/" className="text-primary-600 font-semibold hover:underline">Kembali ke Beranda</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center">
      <div className="w-full max-w-md bg-white min-h-screen shadow-xl relative">
        <header className="bg-primary-600 text-white p-4 flex items-center gap-4 sticky top-0">
          <Link to="/"><ArrowLeft className="w-6 h-6" /></Link>
          <h1 className="font-bold text-lg">Pengajuan Darah Darurat</h1>
        </header>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="bg-red-50 text-red-800 p-4 rounded-xl text-sm mb-6 border border-red-100">
            Formulir ini khusus untuk pengajuan kebutuhan transfusi darah darurat.
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-600 mb-1">Nama Pasien</label>
            <input 
              type="text" required
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-primary-500 outline-none"
              value={formData.patientName}
              onChange={(e) => setFormData({...formData, patientName: e.target.value})}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-slate-600 mb-1">Golongan Darah</label>
              <select 
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-primary-500 outline-none bg-white"
                value={formData.bloodType}
                onChange={(e) => setFormData({...formData, bloodType: e.target.value})}
              >
                {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-600 mb-1">Jumlah Kantong</label>
              <input 
                type="number" min="1" required
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-primary-500 outline-none"
                value={formData.bagsNeeded}
                onChange={(e) => setFormData({...formData, bagsNeeded: parseInt(e.target.value)})}
              />
            </div>
          </div>

          <button type="submit" className="w-full bg-primary-600 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 mt-8 shadow-lg shadow-primary-500/30 hover:bg-primary-700 transition-colors">
            Kirim Pengajuan <Send className="w-5 h-5" />
          </button>
        </form>
      </div>
    </div>
  );
}
