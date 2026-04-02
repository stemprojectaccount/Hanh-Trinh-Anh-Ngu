import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, deleteDoc, doc, getDocs, updateDoc, where } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage, handleFirestoreError, OperationType } from '../firebase';
import { Submission, Quiz, Question, User } from '../types';
import { LayoutDashboard, Plus, Trash2, Users, BookOpen, ChevronRight, CheckCircle2, XCircle, Loader2, ArrowLeft, Image as ImageIcon, FileText, Upload, UserCheck, UserX, ShieldCheck, FileUp, Download, Edit3, HelpCircle, ClipboardPaste } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import mammoth from 'mammoth';

interface AdminDashboardProps {
  user: User;
}

export default function AdminDashboard({ user }: AdminDashboardProps) {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [pendingTeachers, setPendingTeachers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'submissions' | 'quizzes' | 'teachers' | 'guide'>('submissions');
  const [showAddQuiz, setShowAddQuiz] = useState(false);
  const [newQuiz, setNewQuiz] = useState<{title: string, description: string, imageUrl: string, type: 'multiple_choice' | 'file_upload', fileUrl?: string, fileName?: string}>({ title: '', description: '', imageUrl: '', type: 'multiple_choice' });
  const [editingQuiz, setEditingQuiz] = useState<Quiz | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [newQuestion, setNewQuestion] = useState({ text: '', options: ['', '', '', ''], correctOptionIndex: 0, explanation: '', imageUrl: '' });
  const [parsingFile, setParsingFile] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [isPasting, setIsPasting] = useState(false);
  const [gradingSubmission, setGradingSubmission] = useState<Submission | null>(null);
  const [gradingScore, setGradingScore] = useState<number>(0);
  const [gradingFeedback, setGradingFeedback] = useState<string>('');
  const [submittingGrade, setSubmittingGrade] = useState(false);

  const isSuperAdmin = user.email === 'pn9055162@gmail.com' || user.username === 'Trần Thành Đạt';

  const parseQuestionsFromText = async (text: string) => {
    if (!editingQuiz) return;
    
    const questionBlocks = text.split(/Câu \d+:/g).filter(block => block.trim());
    let addedCount = 0;
    
    for (const block of questionBlocks) {
      const lines = block.split('\n').map(l => l.trim()).filter(l => l);
      if (lines.length < 5) continue;

      const questionText = lines[0];
      const options: string[] = [];
      let correctIndex = 0;
      let explanation = '';

      lines.forEach(line => {
        if (line.startsWith('A.')) options[0] = line.replace('A.', '').trim();
        if (line.startsWith('B.')) options[1] = line.replace('B.', '').trim();
        if (line.startsWith('C.')) options[2] = line.replace('C.', '').trim();
        if (line.startsWith('D.')) options[3] = line.replace('D.', '').trim();
        if (line.startsWith('Đáp án:')) {
          const ans = line.replace('Đáp án:', '').trim().toUpperCase();
          correctIndex = ['A', 'B', 'C', 'D'].indexOf(ans);
        }
        if (line.startsWith('Giải thích:')) {
          explanation = line.replace('Giải thích:', '').trim();
        }
      });

      if (options.length >= 2 && questionText) {
        try {
          await addDoc(collection(db, 'quizzes', editingQuiz.id, 'questions'), {
            quizId: editingQuiz.id,
            text: questionText,
            options,
            correctOptionIndex: correctIndex,
            explanation: explanation || 'Không có giải thích.',
            createdAt: serverTimestamp()
          });
          addedCount++;
        } catch (error) {
          handleFirestoreError(error, OperationType.CREATE, `quizzes/${editingQuiz.id}/questions`);
        }
      }
    }
    
    if (addedCount > 0) {
      alert(`Đã thêm thành công ${addedCount} câu hỏi!`);
      setPasteText('');
      setIsPasting(false);
    } else {
      alert('Không tìm thấy câu hỏi nào hợp lệ. Vui lòng kiểm tra lại định dạng.');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editingQuiz) return;

    setParsingFile(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      const text = result.value;
      
      // Basic parsing logic
      // Expected format:
      // Câu 1: [Text]
      // A. [Option]
      // B. [Option]
      // C. [Option]
      // D. [Option]
      // Đáp án: A
      // Giải thích: [Text]
      
      const questionBlocks = text.split(/Câu \d+:/g).filter(block => block.trim());
      const addQuestionPromises: Promise<any>[] = [];
      
      for (const block of questionBlocks) {
        const lines = block.split('\n').map(l => l.trim()).filter(l => l);
        if (lines.length < 5) continue;

        const questionText = lines[0];
        const options: string[] = [];
        let correctIndex = 0;
        let explanation = '';

        lines.forEach(line => {
          if (line.startsWith('A.')) options[0] = line.replace('A.', '').trim();
          if (line.startsWith('B.')) options[1] = line.replace('B.', '').trim();
          if (line.startsWith('C.')) options[2] = line.replace('C.', '').trim();
          if (line.startsWith('D.')) options[3] = line.replace('D.', '').trim();
          if (line.startsWith('Đáp án:')) {
            const ans = line.replace('Đáp án:', '').trim().toUpperCase();
            correctIndex = ['A', 'B', 'C', 'D'].indexOf(ans);
          }
          if (line.startsWith('Giải thích:')) {
            explanation = line.replace('Giải thích:', '').trim();
          }
        });

        if (options.length === 4 && questionText) {
          addQuestionPromises.push(
            addDoc(collection(db, 'quizzes', editingQuiz.id, 'questions'), {
              quizId: editingQuiz.id,
              text: questionText,
              options,
              correctOptionIndex: correctIndex,
              explanation: explanation || 'Không có giải thích.',
              createdAt: serverTimestamp()
            })
          );
        }
      }
      
      await Promise.all(addQuestionPromises);
      
      alert('Đã tải lên câu hỏi thành công!');
    } catch (error) {
      console.error('Error parsing Word file:', error);
      alert('Lỗi khi đọc file Word. Vui lòng kiểm tra định dạng.');
    } finally {
      setParsingFile(false);
    }
  };

  const handleApproveTeacher = async (teacherId: string, status: 'approved' | 'rejected') => {
    try {
      await updateDoc(doc(db, 'users', teacherId), { status });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${teacherId}`);
    }
  };

  useEffect(() => {
    const qSub = query(collection(db, 'submissions'), orderBy('createdAt', 'desc'));
    const unsubscribeSub = onSnapshot(qSub, (snapshot) => {
      setSubmissions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Submission)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'submissions');
    });

    const qQuiz = query(collection(db, 'quizzes'), orderBy('createdAt', 'desc'));
    const unsubscribeQuiz = onSnapshot(qQuiz, (snapshot) => {
      setQuizzes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Quiz)));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'quizzes');
    });

    let unsubscribeTeachers = () => {};
    if (isSuperAdmin) {
      const qTeachers = query(collection(db, 'users'), where('role', '==', 'admin'), where('status', '==', 'pending'));
      unsubscribeTeachers = onSnapshot(qTeachers, (snapshot) => {
        setPendingTeachers(snapshot.docs.map(doc => doc.data() as User));
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, 'users');
      });
    }

    return () => {
      unsubscribeSub();
      unsubscribeQuiz();
      unsubscribeTeachers();
    };
  }, [isSuperAdmin]);

  const [uploadingFile, setUploadingFile] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);

  const handleAddQuiz = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setUploadingFile(true);
      
      // Start uploads in parallel if there are files
      const uploadPromises: Promise<void>[] = [];
      let fileUrl = '';
      let fileName = '';
      let finalImageUrl = newQuiz.imageUrl;

      if (newQuiz.type === 'file_upload' && selectedFile) {
        const fileRef = ref(storage, `assignments/${Date.now()}_${selectedFile.name}`);
        uploadPromises.push(
          uploadBytes(fileRef, selectedFile).then(async () => {
            fileUrl = await getDownloadURL(fileRef);
            fileName = selectedFile.name;
          })
        );
      }

      if (selectedImage) {
        const imageRef = ref(storage, `quiz_images/${Date.now()}_${selectedImage.name}`);
        uploadPromises.push(
          uploadBytes(imageRef, selectedImage).then(async () => {
            finalImageUrl = await getDownloadURL(imageRef);
          })
        );
      }

      // Wait for all uploads to complete
      await Promise.all(uploadPromises);

      // Create quiz document
      const docRef = await addDoc(collection(db, 'quizzes'), {
        ...newQuiz,
        imageUrl: finalImageUrl,
        fileUrl,
        fileName,
        createdAt: serverTimestamp()
      });

      // Create notification asynchronously (don't await it to speed up UI response)
      addDoc(collection(db, 'notifications'), {
        type: 'new_quiz',
        recipient: 'all_students',
        title: 'Bài kiểm tra mới',
        message: `Bài kiểm tra "${newQuiz.title}" vừa được giao.`,
        quizId: docRef.id,
        createdAt: serverTimestamp()
      }).catch(err => console.error("Error creating notification:", err));

      setNewQuiz({ title: '', description: '', imageUrl: '', type: 'multiple_choice' });
      setSelectedFile(null);
      setSelectedImage(null);
      setShowAddQuiz(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'quizzes');
    } finally {
      setUploadingFile(false);
    }
  };

  const handleDeleteQuiz = async (id: string) => {
    if (!confirm('Bạn có chắc chắn muốn xóa bài kiểm tra này?')) return;
    try {
      await deleteDoc(doc(db, 'quizzes', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `quizzes/${id}`);
    }
  };

  const handleEditQuiz = (quiz: Quiz) => {
    setEditingQuiz(quiz);
    // Realtime updates for questions are handled by a useEffect
  };

  useEffect(() => {
    if (!editingQuiz) return;
    const q = query(collection(db, 'quizzes', editingQuiz.id, 'questions'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedQuestions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Question));
      fetchedQuestions.sort((a, b) => {
        const timeA = a.createdAt?.toMillis?.() || 0;
        const timeB = b.createdAt?.toMillis?.() || 0;
        return timeA - timeB;
      });
      setQuestions(fetchedQuestions);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `quizzes/${editingQuiz.id}/questions`);
    });
    return () => unsubscribe();
  }, [editingQuiz]);

  const handleAddQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingQuiz) return;
    try {
      await addDoc(collection(db, 'quizzes', editingQuiz.id, 'questions'), {
        ...newQuestion,
        quizId: editingQuiz.id,
        createdAt: serverTimestamp()
      });
      setNewQuestion({ text: '', options: ['', '', '', ''], correctOptionIndex: 0, explanation: '', imageUrl: '' });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `quizzes/${editingQuiz.id}/questions`);
    }
  };

  const handleGradeSubmission = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gradingSubmission) return;

    setSubmittingGrade(true);
    try {
      await updateDoc(doc(db, 'submissions', gradingSubmission.id), {
        score: gradingScore,
        totalQuestions: 10, // Default to 10 for file uploads, or could be a setting
        status: 'graded',
        teacherFeedback: gradingFeedback
      });

      await addDoc(collection(db, 'notifications'), {
        type: 'quiz_graded',
        recipient: `${gradingSubmission.studentName}_${gradingSubmission.studentClass}`,
        title: 'Đã chấm điểm',
        message: `Bài làm "${gradingSubmission.quizTitle}" của bạn đã được chấm điểm.`,
        submissionId: gradingSubmission.id,
        quizId: gradingSubmission.quizId,
        createdAt: serverTimestamp()
      });

      setGradingSubmission(null);
      setGradingScore(0);
      setGradingFeedback('');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `submissions/${gradingSubmission.id}`);
    } finally {
      setSubmittingGrade(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-20">
        <Loader2 className="w-12 h-12 animate-spin text-indigo-600 mb-4" />
        <p className="text-slate-500">Đang tải dữ liệu quản trị...</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <header className="mb-12 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-4xl font-bold text-slate-900 mb-2">Quản trị hệ thống</h2>
          <p className="text-slate-500">Quản lý bài kiểm tra và theo dõi kết quả học sinh.</p>
        </div>
        <div className="flex flex-wrap bg-white p-1 rounded-2xl shadow-sm border border-slate-100 gap-1">
          <button
            onClick={() => setActiveTab('guide')}
            className={`px-6 py-3 rounded-xl font-bold transition-all flex items-center gap-2 ${activeTab === 'guide' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <HelpCircle className="w-4 h-4" /> Hướng dẫn
          </button>
          <button
            onClick={() => setActiveTab('submissions')}
            className={`px-6 py-3 rounded-xl font-bold transition-all flex items-center gap-2 ${activeTab === 'submissions' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <Users className="w-4 h-4" /> Kết quả
          </button>
          <button
            onClick={() => setActiveTab('quizzes')}
            className={`px-6 py-3 rounded-xl font-bold transition-all flex items-center gap-2 ${activeTab === 'quizzes' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <BookOpen className="w-4 h-4" /> Bài kiểm tra
          </button>
          {isSuperAdmin && (
            <button
              onClick={() => setActiveTab('teachers')}
              className={`px-6 py-3 rounded-xl font-bold transition-all flex items-center gap-2 ${activeTab === 'teachers' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'text-slate-400 hover:text-slate-600'}`}
            >
              <ShieldCheck className="w-4 h-4" /> Duyệt giáo viên
              {pendingTeachers.length > 0 && (
                <span className="bg-red-500 text-white text-[10px] w-4 h-4 flex items-center justify-center rounded-full ml-1">
                  {pendingTeachers.length}
                </span>
              )}
            </button>
          )}
        </div>
      </header>

      <AnimatePresence mode="wait">
        {activeTab === 'guide' ? (
          <motion.div
            key="guide"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="bg-white rounded-3xl shadow-sm border border-slate-100 p-8"
          >
            <h3 className="text-2xl font-bold text-slate-900 mb-6">Hướng dẫn sử dụng cho Giáo viên</h3>
            
            <div className="space-y-8">
              <section>
                <h4 className="text-lg font-bold text-indigo-600 mb-3 flex items-center gap-2">
                  <span className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center">1</span>
                  Tạo bài kiểm tra mới
                </h4>
                <p className="text-slate-600 mb-4">
                  Để giao bài cho học sinh, bạn cần tạo một bài kiểm tra. Chuyển sang tab <strong>Bài kiểm tra</strong> và nhấn vào nút <strong>Thêm bài kiểm tra mới</strong>.
                </p>
                <ul className="list-disc list-inside text-slate-600 space-y-2 ml-4">
                  <li><strong>Trắc nghiệm:</strong> Học sinh sẽ trả lời các câu hỏi trắc nghiệm trực tiếp trên hệ thống. Hệ thống sẽ tự động chấm điểm.</li>
                  <li><strong>Nộp File:</strong> Bạn tải lên một tệp đề bài (Word, PDF, Ảnh). Học sinh sẽ làm bài ra giấy hoặc file và tải lên hệ thống để bạn chấm thủ công.</li>
                </ul>
              </section>

              <section>
                <h4 className="text-lg font-bold text-indigo-600 mb-3 flex items-center gap-2">
                  <span className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center">2</span>
                  Thêm câu hỏi trắc nghiệm siêu tốc
                </h4>
                <p className="text-slate-600 mb-4">
                  Sau khi tạo bài kiểm tra trắc nghiệm, nhấn vào <strong>Quản lý câu hỏi</strong>. Bạn có 3 cách để thêm câu hỏi:
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                    <div className="font-bold text-slate-800 mb-2 flex items-center gap-2"><Plus className="w-4 h-4 text-indigo-600"/> Cách 1: Nhập thủ công</div>
                    <p className="text-sm text-slate-500">Điền từng câu hỏi, các đáp án và chọn đáp án đúng vào form bên dưới.</p>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                    <div className="font-bold text-slate-800 mb-2 flex items-center gap-2"><Upload className="w-4 h-4 text-emerald-600"/> Cách 2: Tải file Word</div>
                    <p className="text-sm text-slate-500">Soạn câu hỏi trên Word theo đúng định dạng và tải lên. Hệ thống sẽ tự động nhận diện.</p>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 relative overflow-hidden">
                    <div className="absolute top-0 right-0 bg-amber-500 text-white text-[10px] font-bold px-2 py-1 rounded-bl-lg">NHANH NHẤT</div>
                    <div className="font-bold text-slate-800 mb-2 flex items-center gap-2"><ClipboardPaste className="w-4 h-4 text-amber-600"/> Cách 3: Dán văn bản</div>
                    <p className="text-sm text-slate-500">Copy văn bản câu hỏi từ bất kỳ đâu và dán vào ô "Dán nhiều câu hỏi".</p>
                  </div>
                </div>
                <div className="mt-4 bg-amber-50 p-4 rounded-xl border border-amber-100">
                  <p className="font-bold text-amber-800 mb-2">Định dạng chuẩn để hệ thống nhận diện (áp dụng cho Cách 2 & 3):</p>
                  <pre className="text-sm text-amber-700 whitespace-pre-wrap font-mono bg-amber-100/50 p-3 rounded-lg">
Câu 1: Nội dung câu hỏi
A. Đáp án A
B. Đáp án B
C. Đáp án C
D. Đáp án D
Đáp án: A
Giải thích: Giải thích chi tiết (không bắt buộc)
                  </pre>
                </div>
              </section>

              <section>
                <h4 className="text-lg font-bold text-indigo-600 mb-3 flex items-center gap-2">
                  <span className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center">3</span>
                  Theo dõi và chấm điểm
                </h4>
                <p className="text-slate-600">
                  Chuyển sang tab <strong>Kết quả</strong> để xem danh sách học sinh đã nộp bài.
                </p>
                <ul className="list-disc list-inside text-slate-600 space-y-2 ml-4 mt-2">
                  <li>Với bài <strong>Trắc nghiệm</strong>: Điểm số được tính tự động.</li>
                  <li>Với bài <strong>Nộp File</strong>: Nhấn vào biểu tượng <Download className="w-4 h-4 inline text-indigo-600" /> để tải bài làm của học sinh, sau đó nhấn <Edit3 className="w-4 h-4 inline text-emerald-600" /> để nhập điểm và nhận xét.</li>
                </ul>
              </section>
            </div>
          </motion.div>
        ) : activeTab === 'submissions' ? (
          <motion.div
            key="submissions"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden"
          >
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="p-6 font-bold text-slate-500 uppercase tracking-wider text-xs">Học sinh</th>
                  <th className="p-6 font-bold text-slate-500 uppercase tracking-wider text-xs">Lớp</th>
                  <th className="p-6 font-bold text-slate-500 uppercase tracking-wider text-xs">Bài kiểm tra</th>
                  <th className="p-6 font-bold text-slate-500 uppercase tracking-wider text-xs">Kết quả</th>
                  <th className="p-6 font-bold text-slate-500 uppercase tracking-wider text-xs">Ngày nộp</th>
                  <th className="p-6 font-bold text-slate-500 uppercase tracking-wider text-xs text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {submissions.map((sub) => (
                  <tr key={sub.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-6">
                      <div className="font-bold text-slate-900">{sub.studentName}</div>
                      <div className="text-sm text-slate-400">{sub.studentEmail || 'N/A'}</div>
                    </td>
                    <td className="p-6 font-bold text-indigo-600">{sub.studentClass}</td>
                    <td className="p-6 font-medium text-slate-600">
                      {sub.quizTitle}
                      {sub.note && (
                        <div className="mt-1 text-xs font-bold text-red-600 bg-red-50 px-2 py-1 rounded-md inline-block">
                          Vi phạm quy chế
                        </div>
                      )}
                    </td>
                    <td className="p-6">
                      {sub.score !== undefined && sub.totalQuestions !== undefined ? (
                        <div className="flex items-center gap-2">
                          <span className={`font-bold text-lg ${
                            (sub.score / sub.totalQuestions) >= 0.8 ? 'text-emerald-600' : 
                            (sub.score / sub.totalQuestions) >= 0.5 ? 'text-yellow-600' : 
                            'text-red-600'
                          }`}>
                            {sub.score}/{sub.totalQuestions}
                          </span>
                          <span className="text-xs text-slate-400 font-bold uppercase tracking-widest">
                            ({Math.round((sub.score / sub.totalQuestions) * 100)}%)
                          </span>
                        </div>
                      ) : (
                        <span className="px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-bold uppercase tracking-widest">
                          Chờ chấm
                        </span>
                      )}
                    </td>
                    <td className="p-6 text-sm text-slate-400">
                      {sub.createdAt?.toDate().toLocaleString('vi-VN')}
                    </td>
                    <td className="p-6 text-right">
                      {sub.fileUrl && (
                        <div className="flex items-center justify-end gap-2">
                          <a
                            href={sub.fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-all"
                            title="Tải bài làm"
                          >
                            <Download className="w-5 h-5" />
                          </a>
                          <button
                            onClick={() => {
                              setGradingSubmission(sub);
                              setGradingScore(sub.score || 0);
                              setGradingFeedback(sub.teacherFeedback || '');
                            }}
                            className="p-2 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 transition-all"
                            title="Chấm điểm"
                          >
                            <Edit3 className="w-5 h-5" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {submissions.length === 0 && (
              <div className="p-20 text-center text-slate-400">Chưa có kết quả nào.</div>
            )}
          </motion.div>
        ) : activeTab === 'teachers' ? (
          <motion.div
            key="teachers"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden"
          >
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="p-6 font-bold text-slate-500 uppercase tracking-wider text-xs">Giáo viên</th>
                  <th className="p-6 font-bold text-slate-500 uppercase tracking-wider text-xs">Tên đăng nhập</th>
                  <th className="p-6 font-bold text-slate-500 uppercase tracking-wider text-xs">Trạng thái</th>
                  <th className="p-6 font-bold text-slate-500 uppercase tracking-wider text-xs text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {pendingTeachers.map((teacher) => (
                  <tr key={teacher.uid} className="hover:bg-slate-50 transition-colors">
                    <td className="p-6 font-bold text-slate-900">{teacher.displayName}</td>
                    <td className="p-6 text-slate-600">{teacher.username || 'N/A'}</td>
                    <td className="p-6">
                      <span className="px-3 py-1 bg-yellow-100 text-yellow-600 rounded-full text-xs font-bold uppercase tracking-widest">
                        Đang chờ duyệt
                      </span>
                    </td>
                    <td className="p-6 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleApproveTeacher(teacher.uid, 'approved')}
                          className="p-2 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 transition-all"
                          title="Duyệt"
                        >
                          <UserCheck className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => handleApproveTeacher(teacher.uid, 'rejected')}
                          className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-all"
                          title="Từ chối"
                        >
                          <UserX className="w-5 h-5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {pendingTeachers.length === 0 && (
              <div className="p-20 text-center text-slate-400">Không có yêu cầu duyệt nào.</div>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="quizzes"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            {!editingQuiz ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <button
                  onClick={() => setShowAddQuiz(true)}
                  className="bg-white rounded-3xl p-8 border-2 border-dashed border-slate-200 hover:border-indigo-600 hover:bg-indigo-50 transition-all flex flex-col items-center justify-center gap-4 group"
                >
                  <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-all">
                    <Plus className="w-6 h-6" />
                  </div>
                  <span className="font-bold text-slate-400 group-hover:text-indigo-600 transition-all">Thêm bài kiểm tra mới</span>
                </button>

                {quizzes.map((quiz) => (
                  <div key={quiz.id} className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 flex flex-col group">
                    {quiz.imageUrl && (
                      <img src={quiz.imageUrl} alt={quiz.title} className="w-full h-40 object-cover rounded-2xl mb-4" referrerPolicy="no-referrer" />
                    )}
                    <h3 className="text-xl font-bold text-slate-900 mb-2">{quiz.title}</h3>
                    <p className="text-slate-500 text-sm mb-6 line-clamp-2">{quiz.description}</p>
                    <div className="mt-auto flex items-center justify-between pt-4 border-t border-slate-50">
                      <button onClick={() => handleEditQuiz(quiz)} className="text-indigo-600 font-bold text-sm hover:underline">Quản lý câu hỏi</button>
                      <button onClick={() => handleDeleteQuiz(quiz.id)} className="text-red-400 hover:text-red-600 transition-colors">
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100">
                <button onClick={() => setEditingQuiz(null)} className="mb-8 text-slate-400 hover:text-slate-600 transition-colors flex items-center gap-2">
                  <ArrowLeft className="w-4 h-4" /> Quay lại danh sách
                </button>
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 gap-4">
                  <h3 className="text-2xl font-bold text-slate-900">Quản lý câu hỏi: {editingQuiz.title}</h3>
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      onClick={() => setIsPasting(!isPasting)}
                      className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold transition-all text-sm ${isPasting ? 'bg-amber-500 text-white shadow-md' : 'bg-amber-50 text-amber-600 hover:bg-amber-100'}`}
                    >
                      <ClipboardPaste className="w-4 h-4" /> Dán nhiều câu hỏi
                    </button>
                    <label className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold cursor-pointer transition-all text-sm ${parsingFile ? 'bg-slate-100 text-slate-400' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'}`}>
                      {parsingFile ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                      {parsingFile ? 'Đang xử lý...' : 'Tải file Word (.docx)'}
                      <input type="file" accept=".docx" onChange={handleFileUpload} className="hidden" disabled={parsingFile} />
                    </label>
                  </div>
                </div>

                <AnimatePresence>
                  {isPasting && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mb-8 overflow-hidden"
                    >
                      <div className="bg-amber-50 p-6 rounded-2xl border border-amber-100">
                        <h4 className="font-bold text-amber-900 mb-2 flex items-center gap-2"><ClipboardPaste className="w-5 h-5"/> Dán văn bản chứa các câu hỏi</h4>
                        <p className="text-sm text-amber-700 mb-4">Hệ thống sẽ tự động nhận diện các câu hỏi theo định dạng chuẩn (Câu 1:, A., B., C., D., Đáp án:).</p>
                        <textarea
                          value={pasteText}
                          onChange={e => setPasteText(e.target.value)}
                          placeholder="Câu 1: Thủ đô của Việt Nam là gì?&#10;A. Hồ Chí Minh&#10;B. Hà Nội&#10;C. Đà Nẵng&#10;D. Huế&#10;Đáp án: B"
                          className="w-full p-4 rounded-xl border border-amber-200 focus:ring-2 focus:ring-amber-500 outline-none h-48 mb-4 font-mono text-sm shadow-inner bg-white"
                        />
                        <div className="flex justify-end gap-3">
                          <button onClick={() => setIsPasting(false)} className="px-6 py-2 rounded-xl font-bold text-amber-700 hover:bg-amber-100 transition-all">Hủy</button>
                          <button 
                            onClick={() => parseQuestionsFromText(pasteText)}
                            disabled={!pasteText.trim()}
                            className="px-6 py-2 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white font-bold rounded-xl transition-all shadow-md flex items-center gap-2"
                          >
                            <Plus className="w-4 h-4" /> Xử lý & Thêm câu hỏi
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                
                <div className="bg-slate-50 p-4 rounded-xl mb-8 text-sm text-slate-500 border border-slate-100">
                  <p className="font-bold mb-1">Định dạng file Word:</p>
                  <p>Câu 1: [Nội dung]<br/>A. [Lựa chọn]<br/>B. [Lựa chọn]<br/>C. [Lựa chọn]<br/>D. [Lựa chọn]<br/>Đáp án: A<br/>Giải thích: [Nội dung]</p>
                </div>
                
                <div className="space-y-6 mb-12">
                  {questions.map((q, i) => (
                    <div key={q.id} className="p-6 rounded-2xl bg-slate-50 border border-slate-100 flex items-start justify-between gap-4">
                      <div>
                        <div className="font-bold text-slate-900 mb-2">Câu {i + 1}: {q.text}</div>
                        <div className="text-sm text-slate-500">Đáp án đúng: {q.options[q.correctOptionIndex]}</div>
                      </div>
                      <button onClick={async () => {
                        if (confirm('Xóa câu hỏi này?')) {
                          await deleteDoc(doc(db, 'quizzes', editingQuiz.id, 'questions', q.id));
                        }
                      }} className="text-red-400 hover:text-red-600 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  {questions.length === 0 && <div className="text-center text-slate-400 py-8">Chưa có câu hỏi nào.</div>}
                </div>

                <form onSubmit={handleAddQuestion} className="bg-slate-50 p-8 rounded-3xl border border-slate-100">
                  <h4 className="text-lg font-bold text-slate-900 mb-6">Thêm câu hỏi mới</h4>
                  <div className="space-y-4">
                    <input
                      type="text"
                      placeholder="Nội dung câu hỏi"
                      value={newQuestion.text}
                      onChange={e => setNewQuestion({ ...newQuestion, text: e.target.value })}
                      className="w-full p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-600 outline-none"
                      required
                    />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {newQuestion.options.map((opt, idx) => (
                        <input
                          key={idx}
                          type="text"
                          placeholder={`Lựa chọn ${idx + 1}`}
                          value={opt}
                          onChange={e => {
                            const opts = [...newQuestion.options];
                            opts[idx] = e.target.value;
                            setNewQuestion({ ...newQuestion, options: opts });
                          }}
                          className="w-full p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-600 outline-none"
                          required
                        />
                      ))}
                    </div>
                    <div className="flex items-center gap-4">
                      <label className="text-sm font-bold text-slate-500">Đáp án đúng:</label>
                      <select
                        value={newQuestion.correctOptionIndex}
                        onChange={e => setNewQuestion({ ...newQuestion, correctOptionIndex: parseInt(e.target.value) })}
                        className="p-3 rounded-xl border border-slate-200 outline-none"
                      >
                        {newQuestion.options.map((_, idx) => (
                          <option key={idx} value={idx}>Lựa chọn {idx + 1}</option>
                        ))}
                      </select>
                    </div>
                    <textarea
                      placeholder="Giải thích đáp án (hỗ trợ Markdown)"
                      value={newQuestion.explanation}
                      onChange={e => setNewQuestion({ ...newQuestion, explanation: e.target.value })}
                      className="w-full p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-600 outline-none h-32"
                      required
                    />
                    <input
                      type="url"
                      placeholder="Link ảnh minh họa (tùy chọn)"
                      value={newQuestion.imageUrl}
                      onChange={e => setNewQuestion({ ...newQuestion, imageUrl: e.target.value })}
                      className="w-full p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-600 outline-none"
                    />
                    <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-xl transition-all shadow-lg shadow-indigo-100">
                      Thêm câu hỏi
                    </button>
                  </div>
                </form>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Quiz Modal */}
      <AnimatePresence>
        {showAddQuiz && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl"
            >
              <h3 className="text-2xl font-bold text-slate-900 mb-6">Thêm bài kiểm tra</h3>
              <form onSubmit={handleAddQuiz} className="space-y-4">
                <div className="flex gap-4 mb-4">
                  <label className={`flex-1 p-4 rounded-xl border-2 cursor-pointer transition-all flex flex-col items-center gap-2 ${newQuiz.type === 'multiple_choice' ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-500 hover:border-indigo-300'}`}>
                    <input type="radio" name="quizType" value="multiple_choice" checked={newQuiz.type === 'multiple_choice'} onChange={() => setNewQuiz({...newQuiz, type: 'multiple_choice'})} className="hidden" />
                    <BookOpen className="w-6 h-6" />
                    <span className="font-bold text-sm">Trắc nghiệm</span>
                  </label>
                  <label className={`flex-1 p-4 rounded-xl border-2 cursor-pointer transition-all flex flex-col items-center gap-2 ${newQuiz.type === 'file_upload' ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-500 hover:border-indigo-300'}`}>
                    <input type="radio" name="quizType" value="file_upload" checked={newQuiz.type === 'file_upload'} onChange={() => setNewQuiz({...newQuiz, type: 'file_upload'})} className="hidden" />
                    <FileUp className="w-6 h-6" />
                    <span className="font-bold text-sm">Nộp File</span>
                  </label>
                </div>
                <input
                  type="text"
                  placeholder="Tiêu đề"
                  value={newQuiz.title}
                  onChange={e => setNewQuiz({ ...newQuiz, title: e.target.value })}
                  className="w-full p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-600 outline-none"
                  required
                />
                <textarea
                  placeholder="Mô tả"
                  value={newQuiz.description}
                  onChange={e => setNewQuiz({ ...newQuiz, description: e.target.value })}
                  className="w-full p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-600 outline-none h-24"
                  required
                />
                <div className="border-2 border-dashed border-slate-200 rounded-xl p-4 text-center hover:border-indigo-600 transition-colors">
                  <input
                    type="file"
                    accept="image/*"
                    id="quiz-image"
                    className="hidden"
                    onChange={(e) => setSelectedImage(e.target.files?.[0] || null)}
                  />
                  <label htmlFor="quiz-image" className="cursor-pointer flex flex-col items-center gap-2">
                    <ImageIcon className="w-6 h-6 text-slate-400" />
                    <span className="text-sm font-medium text-slate-600">
                      {selectedImage ? selectedImage.name : 'Tải lên ảnh bìa (tùy chọn)'}
                    </span>
                  </label>
                  <div className="mt-3 flex items-center gap-2">
                    <div className="h-px bg-slate-200 flex-1"></div>
                    <span className="text-xs text-slate-400">hoặc nhập link</span>
                    <div className="h-px bg-slate-200 flex-1"></div>
                  </div>
                  <input
                    type="url"
                    placeholder="Link ảnh bìa (tùy chọn)"
                    value={newQuiz.imageUrl}
                    onChange={e => setNewQuiz({ ...newQuiz, imageUrl: e.target.value })}
                    className="mt-3 w-full p-3 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-600 outline-none text-sm"
                  />
                </div>
                {newQuiz.type === 'file_upload' && (
                  <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center hover:border-indigo-600 transition-colors">
                    <input
                      type="file"
                      id="assignment-file"
                      className="hidden"
                      onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                      required
                    />
                    <label htmlFor="assignment-file" className="cursor-pointer flex flex-col items-center gap-2">
                      {selectedFile && selectedFile.type.startsWith('image/') ? (
                        <img src={URL.createObjectURL(selectedFile)} alt="Preview" className="max-h-32 rounded-lg object-contain mb-2" />
                      ) : (
                        <FileText className="w-8 h-8 text-slate-400" />
                      )}
                      <span className="text-sm font-medium text-slate-600">
                        {selectedFile ? selectedFile.name : 'Chọn file bài tập (Word, PDF, Ảnh...)'}
                      </span>
                    </label>
                  </div>
                )}
                <div className="flex gap-4 pt-4">
                  <button type="button" onClick={() => setShowAddQuiz(false)} className="flex-1 py-4 rounded-xl font-bold text-slate-400 hover:bg-slate-50 transition-all">Hủy</button>
                  <button type="submit" disabled={uploadingFile} className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-bold py-4 rounded-xl transition-all shadow-lg shadow-indigo-100 flex items-center justify-center gap-2">
                    {uploadingFile && <Loader2 className="w-5 h-5 animate-spin" />}
                    {uploadingFile ? 'Đang tạo...' : 'Tạo'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Grading Modal */}
      <AnimatePresence>
        {gradingSubmission && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl"
            >
              <h3 className="text-2xl font-bold text-slate-900 mb-2">Chấm điểm bài làm</h3>
              <p className="text-slate-500 mb-6">Học sinh: <span className="font-bold text-slate-700">{gradingSubmission.studentName}</span></p>
              
              {gradingSubmission.note && (
                <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4">
                  <h4 className="font-bold text-red-900 text-sm uppercase tracking-widest mb-1">Ghi chú vi phạm</h4>
                  <p className="text-red-700 text-sm">{gradingSubmission.note}</p>
                </div>
              )}

              <form onSubmit={handleGradeSubmission} className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Điểm số (trên thang 10)</label>
                  <input
                    type="number"
                    min="0"
                    max="10"
                    step="0.5"
                    value={gradingScore}
                    onChange={e => setGradingScore(parseFloat(e.target.value))}
                    className="w-full p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-600 outline-none text-lg font-bold"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Nhận xét của giáo viên</label>
                  <textarea
                    placeholder="Nhập nhận xét, đánh giá..."
                    value={gradingFeedback}
                    onChange={e => setGradingFeedback(e.target.value)}
                    className="w-full p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-600 outline-none h-32"
                  />
                </div>
                <div className="flex gap-4 pt-4">
                  <button type="button" onClick={() => setGradingSubmission(null)} className="flex-1 py-4 rounded-xl font-bold text-slate-400 hover:bg-slate-50 transition-all">Hủy</button>
                  <button type="submit" disabled={submittingGrade} className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-bold py-4 rounded-xl transition-all shadow-lg shadow-indigo-100 flex items-center justify-center gap-2">
                    {submittingGrade && <Loader2 className="w-5 h-5 animate-spin" />}
                    {submittingGrade ? 'Đang lưu...' : 'Lưu điểm'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
