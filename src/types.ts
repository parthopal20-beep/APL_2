export type Role = 'ADMIN' | 'SUPERVISOR' | 'EMPLOYEE';
export type PaymentBase = 'DAILY_FIXED' | 'PER_SHIPMENT' | 'DRIVER';
export type UserStatus = 'ACTIVE' | 'BLOCKED' | 'SUSPENDED';

export interface UserProfile {
  id: string; // Document ID (Supabase Auth UUID)
  username: string; // Human-readable ID (e.g. EMP-001 or partho)
  name: string;
  role: Role;
  department?: string;
  jobTitle: string;
  paymentBase: PaymentBase;
  rate: number;
  status: UserStatus;
  lastActive: string;
  language: 'en' | 'bn';
  email: string; // Internal email constructed as u_id@apl-system.com
  profilePicture?: string;
  activeSessions?: string[]; // Array of session IDs for concurrent login management
  employeeCategory?: string;
  passwordHash?: string; // Saved for local fallback mode
}

export interface AttendanceRecord {
  id?: string;
  userId: string;
  date: string; // YYYY-MM-DD
  checkInTime: string;
  checkOutTime?: string;
  checkInLocation: {
    latitude: number;
    longitude: number;
    address?: string;
  };
  checkOutLocation?: {
    latitude: number;
    longitude: number;
    address?: string;
  };
  checkInPhoto?: string;
  checkOutPhoto?: string;
  shipments?: number;
  odometerStart?: number;
  odometerEnd?: number;
  distanceDriven?: number;
  earnings: number;
  hoursWorked?: number;
  status: 'PRESENT' | 'ABSENT' | 'FRAUDULENT';
  reviewNeeded?: boolean;
  barcodes?: string[];
  customerValue?: number;
  erpValue?: number;
  valueDifference?: number;
  customerPhoto?: string;
  selectedPinCodes?: string[];
}

export interface ValueMismatch {
  id?: string;
  userId: string;
  employeeName: string;
  date: string;
  timestamp: string;
  barcodes: string[];
  customerValue: number;
  erpValue: number;
  valueDifference: number;
  customerPhoto?: string;
  erpPhoto?: string;
}

export interface ChatMessage {
  id?: string;
  senderId: string;
  senderName: string;
  text?: string;
  photoUrl?: string;
  audioUrl?: string;
  timestamp: string;
}

export interface VoiceBroadcast {
  id?: string;
  senderId: string;
  senderName: string;
  audioUrl: string;
  timestamp: string;
}

export interface SalaryRecord {
  id?: string;
  userId: string;
  userName: string;
  month: string; // YYYY-MM
  baseSalary: number;
  shipmentEarnings: number;
  totalEarnings: number;
  totalHours: number;
  totalShipments: number;
  totalMileage?: number;
  daysPresent: number;
  calculatedAt: string;
  status: 'PAID' | 'PENDING';
}

export interface Payday {
  id?: string;
  userId: string;
  date: string; // YYYY-MM-DD
  markedBy: string;
  timestamp: string;
}

export interface AdHocJob {
  id?: string;
  userId: string;
  employeeName: string;
  date: string;
  vehicleType: 'TOTO' | 'TATA ACE(107)' | 'MOTOR VAN' | 'ENGINE VAN';
  startTime: string;
  endTime: string;
  totalHours: number;
  value: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  timestamp: string;
}
