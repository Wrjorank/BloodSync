export interface RequestData {
  id: string;
  patientName: string;
  bloodType: string;
  bagsNeeded: number;
  bagsFulfilled: number;
  status: 'PENDING' | 'BROADCASTING' | 'FULFILLED' | 'CLOSED';
  faskesId?: string;
  createdAt: string;
}

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}
