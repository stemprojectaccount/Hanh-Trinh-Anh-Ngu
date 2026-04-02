export interface User {
  uid: string;
  email: string;
  username?: string;
  displayName: string | null;
  photoURL: string | null;
  role: 'admin' | 'student';
  status?: 'pending' | 'approved' | 'rejected';
}

export interface Quiz {
  id: string;
  title: string;
  description: string;
  imageUrl?: string;
  createdAt: any;
  type?: 'multiple_choice' | 'file_upload';
  fileUrl?: string;
  fileName?: string;
}

export interface Question {
  id: string;
  quizId: string;
  text: string;
  options: string[];
  correctOptionIndex: number;
  explanation: string;
  imageUrl?: string;
  createdAt?: any;
}

export interface Submission {
  id: string;
  quizId: string;
  quizTitle: string;
  studentId?: string;
  studentName: string;
  studentEmail?: string;
  studentClass: string;
  answers?: number[];
  score?: number;
  totalQuestions?: number;
  createdAt: any;
  fileUrl?: string;
  fileName?: string;
  status?: 'submitted' | 'graded';
  teacherFeedback?: string;
  note?: string;
}
