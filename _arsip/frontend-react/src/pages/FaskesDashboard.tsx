import { useEffect, useState } from 'react';
import { api } from '../services/api';
import { io } from 'socket.io-client';
import { Droplet, Activity, Bell, CheckCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { RequestData, ApiResponse } from '../types';

const socket = io('http://localhost:5000');

export default function FaskesDashboard() {
  const [requests, setRequests] = useState<RequestData[]>([]);

  const fetchRequests = async () => {
    try {
      const res = await api.get<ApiResponse<RequestData[]>>('/requests/active');
      setRequests((res as any).data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchRequests();
    
    socket.on('emergency_alert', () => {
      fetchRequests();
    });

    return () => {
      socket.off('emergency_alert');
    };
  }, []);

  const handleBroadcast = async (id: string) => {
    try {
      await api.put(`/requests/${id}/status`, { status: 'BROADCASTING' });
      socket.emit('dispatch_emergency', { requestId: id });
      fetchRequests();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b-4 border-primary-600 px-6 py-4 flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-3">
          <Droplet className="text-primary-600 fill-primary-600 w-8 h-8" />
          <h1 className="text-xl font-bold text-slate-800">PMI/RS Dashboard</h1>
        </div>
        <Link to="/" className="text-slate-500 hover:text-primary-600 font-semibold">Kembali</Link>
      </header>
      
      <main className="flex-grow p-6">
        <div className="max-w-5xl mx-auto">
          <div className="flex justify-between items-end mb-6">
            <h2 className="text-2xl font-bold text-slate-800 border-l-4 border-primary-600 pl-3">Permintaan Darurat</h2>
            <button onClick={fetchRequests} className="text-primary-600 text-sm font-semibold hover:underline">Refresh</button>
          </div>
          
          <div className="grid gap-4">
            {requests.map((req) => (
              <div key={req.id} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col md:flex-row justify-between items-center gap-4 transition-all">
                <div className="w-full md:w-auto">
                  <h3 className="font-bold text-xl text-slate-800 flex items-center gap-2">
                    {req.patientName} 
                    <span className="text-primary-600 bg-primary-50 px-2 py-0.5 rounded-lg text-sm font-bold border border-primary-100">{req.bloodType}</span>
                  </h3>
                  <p className="text-slate-500 text-sm mt-1">Butuh {req.bagsNeeded} Kantong • ID: {req.id}</p>
                </div>

                <div className="w-full md:w-auto flex justify-end">
                  {req.status === 'PENDING' && (
                    <button onClick={() => handleBroadcast(req.id)} className="w-full md:w-auto bg-primary-600 hover:bg-primary-700 text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-primary-500/30 transition-all flex items-center justify-center gap-2">
                      <Activity className="w-5 h-5" /> Aktifkan Code Red
                    </button>
                  )}
                  {req.status === 'BROADCASTING' && (
                    <span className="flex items-center gap-2 text-blue-600 bg-blue-50 px-5 py-3 rounded-xl font-bold border border-blue-100 w-full md:w-auto justify-center">
                      <Bell className="w-5 h-5 animate-pulse" /> Sedang Menyiarkan Notifikasi...
                    </span>
                  )}
                  {req.status === 'FULFILLED' && (
                    <span className="flex items-center gap-2 text-green-600 bg-green-50 px-5 py-3 rounded-xl font-bold border border-green-100 w-full md:w-auto justify-center">
                      <CheckCircle className="w-5 h-5" /> Kebutuhan Terpenuhi
                    </span>
                  )}
                </div>
              </div>
            ))}
            
            {requests.length === 0 && (
              <div className="text-center p-16 text-slate-400 bg-white rounded-3xl border border-dashed border-slate-300">
                <Droplet className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                <p>Belum ada permintaan darurat masuk.</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
