import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage, handleFirestoreError, OperationType } from '../firebase';
import { Quiz, Question, User } from '../types';
import { CheckCircle2, XCircle, ArrowRight, ArrowLeft, Loader2, Trophy, Image as ImageIcon, Download, Upload, FileText } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface QuizViewProps {
  quiz: Quiz;
  user: User | null;
  studentInfo: { name: string; className: string } | null;
  onComplete: () => void;
  onCancel: () => void;
}

export default function QuizView({ quiz, user, studentInfo, onComplete, onCancel }: QuizViewProps) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [finished, setFinished] = useState(false);
  const [score, setScore] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Anti-cheat state
  const [violationCount, setViolationCount] = useState(0);
  const [showWarning, setShowWarning] = useState(false);
  const [timeLeft, setTimeLeft] = useState(10);
  const [forceSubmitted, setForceSubmitted] = useState(false);

  const timerRef = React.useRef<NodeJS.Timeout | null>(null);
  const finishedRef = React.useRef(finished);
  const violationRef = React.useRef(violationCount);
  const submittingRef = React.useRef(submitting);

  useEffect(() => {
    finishedRef.current = finished;
  }, [finished]);

  useEffect(() => {
    violationRef.current = violationCount;
  }, [violationCount]);

  useEffect(() => {
    submittingRef.current = submitting;
  }, [submitting]);

  useEffect(() => {
    if (quiz.type === 'file_upload') {
      setLoading(false);
      return;
    }
    const q = query(collection(db, 'quizzes', quiz.id, 'questions'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const questionList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Question));
      questionList.sort((a, b) => {
        const timeA = a.createdAt?.toMillis?.() || 0;
        const timeB = b.createdAt?.toMillis?.() || 0;
        return timeA - timeB;
      });
      setQuestions(questionList);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `quizzes/${quiz.id}/questions`);
    });
    return () => unsubscribe();
  }, [quiz.id, quiz.type]);

  const handleAnswer = (optionIndex: number) => {
    const newAnswers = [...answers];
    newAnswers[currentIndex] = optionIndex;
    setAnswers(newAnswers);
  };

  const calculateScore = () => {
    let s = 0;
    questions.forEach((q, i) => {
      if (answers[i] === q.correctOptionIndex) s++;
    });
    return s;
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    
    try {
      let submissionData: any = {
        quizId: quiz.id,
        quizTitle: quiz.title,
        studentId: user?.uid || null,
        studentName: user?.displayName || studentInfo?.name || 'Anonymous',
        studentEmail: user?.email || null,
        studentClass: studentInfo?.className || 'N/A',
        createdAt: serverTimestamp()
      };

      if (quiz.type === 'file_upload') {
        if (!selectedFile) {
          alert('Vui lòng chọn file để nộp!');
          setSubmitting(false);
          return;
        }
        const fileRef = ref(storage, `submissions/${Date.now()}_${selectedFile.name}`);
        await uploadBytes(fileRef, selectedFile);
        const fileUrl = await getDownloadURL(fileRef);
        
        submissionData = {
          ...submissionData,
          fileUrl,
          fileName: selectedFile.name,
          status: 'submitted'
        };
      } else {
        const finalScore = calculateScore();
        setScore(finalScore);
        submissionData = {
          ...submissionData,
          answers: answers,
          score: finalScore,
          totalQuestions: questions.length
        };
      }

      const docRef = await addDoc(collection(db, 'submissions'), submissionData);
      
      await addDoc(collection(db, 'notifications'), {
        type: 'new_submission',
        recipient: 'admins',
        title: 'New Quiz Submission',
        message: `${submissionData.studentName} (${submissionData.studentClass}) submitted "${quiz.title}".`,
        submissionId: docRef.id,
        quizId: quiz.id,
        createdAt: serverTimestamp()
      });

      setFinished(true);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'submissions');
    } finally {
      setSubmitting(false);
    }
  };

  const handleForceSubmit = async () => {
    if (finishedRef.current || submittingRef.current) return;
    setSubmitting(true);
    
    try {
      let submissionData: any = {
        quizId: quiz.id,
        quizTitle: quiz.title,
        studentId: user?.uid || null,
        studentName: user?.displayName || studentInfo?.name || 'Anonymous',
        studentEmail: user?.email || null,
        studentClass: studentInfo?.className || 'N/A',
        createdAt: serverTimestamp(),
        note: 'Hệ thống: Hủy bài thi do vi phạm (Sử dụng AI/Rời khỏi màn hình)'
      };

      if (quiz.type === 'file_upload') {
        submissionData = {
          ...submissionData,
          fileUrl: '',
          fileName: '',
          status: 'submitted'
        };
      } else {
        setScore(0);
        submissionData = {
          ...submissionData,
          answers: [],
          score: 0,
          totalQuestions: questions.length
        };
      }

      const docRef = await addDoc(collection(db, 'submissions'), submissionData);
      
      await addDoc(collection(db, 'notifications'), {
        type: 'new_submission',
        recipient: 'admins',
        title: 'Quiz Submission (Violation)',
        message: `${submissionData.studentName} (${submissionData.studentClass}) bị hủy bài "${quiz.title}" do vi phạm.`,
        submissionId: docRef.id,
        quizId: quiz.id,
        createdAt: serverTimestamp()
      });

      setForceSubmitted(true);
      setFinished(true);
    } catch (error) {
      console.error(error);
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (quiz.type === 'file_upload') return; // Disable anti-cheat for file upload quizzes

    const handleLeave = () => {
      if (finishedRef.current || submittingRef.current) return;

      if (violationRef.current === 0) {
        violationRef.current = 1; // Update immediately to prevent race conditions
        setViolationCount(1);
        setShowWarning(true);
        setTimeLeft(10);
        
        if (timerRef.current) clearInterval(timerRef.current);
        
        timerRef.current = setInterval(() => {
          setTimeLeft((prev) => {
            if (prev <= 1) {
              if (timerRef.current) clearInterval(timerRef.current);
              if (document.hidden || !document.hasFocus()) {
                violationRef.current = 2;
                setViolationCount(2);
                handleForceSubmit();
              }
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      } else if (violationRef.current === 1) {
        violationRef.current = 2;
        setViolationCount(2);
        if (timerRef.current) clearInterval(timerRef.current);
        handleForceSubmit();
      }
    };

    const handleReturn = () => {
      if (finishedRef.current || submittingRef.current) return;
      if (violationRef.current === 1 && timerRef.current) {
        clearInterval(timerRef.current);
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        handleLeave();
      } else {
        handleReturn();
      }
    };

    const handleWindowBlur = () => {
      handleLeave();
    };

    const handleWindowFocus = () => {
      handleReturn();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('focus', handleWindowFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('focus', handleWindowFocus);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [quiz.id]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-20">
        <Loader2 className="w-12 h-12 animate-spin text-indigo-600 mb-4" />
        <p className="text-slate-500">Đang tải câu hỏi...</p>
      </div>
    );
  }

  if (quiz.type !== 'file_upload' && questions.length === 0) {
    return (
      <div className="bg-white rounded-3xl p-12 text-center border border-slate-100">
        <p className="text-slate-500 mb-6">Bài kiểm tra này chưa có câu hỏi nào.</p>
        <button onClick={onCancel} className="text-indigo-600 font-semibold flex items-center gap-2 mx-auto">
          <ArrowLeft className="w-4 h-4" /> Quay lại
        </button>
      </div>
    );
  }

  if (finished) {
    if (forceSubmitted) {
      return (
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-3xl p-12 text-center border border-red-100 shadow-xl"
        >
          <div className="w-24 h-24 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-8">
            <XCircle className="w-12 h-12 text-red-600" />
          </div>
          <h2 className="text-3xl font-bold text-red-600 mb-2">Bài thi đã bị hủy!</h2>
          <p className="text-slate-600 mb-8">Bạn đã vi phạm quy chế thi (Rời khỏi màn hình làm bài / Sử dụng AI).</p>
          <div className="bg-slate-50 rounded-2xl p-6 mb-8">
            <p className="text-sm text-slate-400 uppercase tracking-widest font-bold mb-1">Kết quả của bạn</p>
            <p className="text-5xl font-black text-red-600">0</p>
          </div>
          <button 
            onClick={onComplete}
            className="bg-slate-900 text-white px-8 py-4 rounded-xl font-semibold hover:bg-slate-800 transition-colors"
          >
            Quay lại trang chủ
          </button>
        </motion.div>
      );
    }

    return (
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-3xl p-12 text-center border border-slate-100 shadow-xl"
      >
        <div className="w-24 h-24 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-8">
          <CheckCircle2 className="w-12 h-12 text-emerald-600" />
        </div>
        <h2 className="text-3xl font-bold text-slate-900 mb-2">Hoàn thành!</h2>
        <p className="text-slate-500 mb-8">Bạn đã nộp bài <strong>{quiz.title}</strong> thành công.</p>
        
        {quiz.type !== 'file_upload' && (
          <div className="bg-slate-50 rounded-2xl p-6 mb-8">
            <p className="text-sm text-slate-400 uppercase tracking-widest font-bold mb-1">Kết quả của bạn</p>
            <p className="text-5xl font-black text-indigo-600">{score} / {questions.length}</p>
          </div>
        )}

        {quiz.type === 'file_upload' && (
          <div className="bg-slate-50 rounded-2xl p-6 mb-8">
            <p className="text-slate-600">Giáo viên sẽ chấm điểm và phản hồi lại cho bạn sau.</p>
          </div>
        )}

        <button
          onClick={onComplete}
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 px-8 rounded-2xl transition-all shadow-lg shadow-indigo-100"
        >
          Quay lại danh sách
        </button>
      </motion.div>
    );
  }

  if (quiz.type === 'file_upload') {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="mb-8 flex items-center justify-between">
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600 transition-colors flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" /> Thoát
          </button>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100"
        >
          <h2 className="text-3xl font-bold text-slate-900 mb-4">{quiz.title}</h2>
          <p className="text-slate-600 mb-8 whitespace-pre-wrap">{quiz.description}</p>

          {quiz.fileUrl && (
            <div className="mb-8 p-6 bg-indigo-50 rounded-2xl border border-indigo-100 flex flex-col gap-4">
              {quiz.fileName?.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                <img src={quiz.fileUrl} alt="Assignment" className="w-full rounded-xl object-contain max-h-96" />
              ) : null}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-indigo-600 shadow-sm">
                    <FileText className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="font-bold text-slate-900">File bài tập</p>
                    <p className="text-sm text-slate-500">{quiz.fileName || 'Tài liệu đính kèm'}</p>
                  </div>
                </div>
                <a 
                  href={quiz.fileUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="px-6 py-3 bg-white text-indigo-600 font-bold rounded-xl shadow-sm hover:shadow-md transition-all flex items-center gap-2"
                >
                  <Download className="w-4 h-4" /> Tải xuống
                </a>
              </div>
            </div>
          )}

          <div className="border-t border-slate-100 pt-8">
            <h3 className="text-xl font-bold text-slate-900 mb-4">Nộp bài làm của bạn</h3>
            <div className="border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center hover:border-indigo-600 transition-colors mb-8">
              <input
                type="file"
                id="student-file"
                className="hidden"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
              />
              <label htmlFor="student-file" className="cursor-pointer flex flex-col items-center gap-4">
                {selectedFile && selectedFile.type.startsWith('image/') ? (
                  <img src={URL.createObjectURL(selectedFile)} alt="Preview" className="max-h-48 rounded-xl object-contain" />
                ) : (
                  <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center text-slate-400">
                    <Upload className="w-8 h-8" />
                  </div>
                )}
                <div>
                  <p className="font-bold text-slate-700 text-lg mb-1">
                    {selectedFile ? selectedFile.name : 'Nhấn để chọn file'}
                  </p>
                  <p className="text-slate-500 text-sm">Hỗ trợ Word, PDF, Excel, Hình ảnh...</p>
                </div>
              </label>
            </div>

            <button
              disabled={!selectedFile || submitting}
              onClick={handleSubmit}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 text-white font-bold py-4 px-8 rounded-2xl transition-all shadow-lg shadow-indigo-100 flex items-center justify-center gap-2"
            >
              {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Nộp bài ngay'}
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  const currentQuestion = questions[currentIndex];
  const progress = ((currentIndex + 1) / questions.length) * 100;

  return (
    <div className="max-w-3xl mx-auto">
      {showWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full text-center shadow-2xl">
            <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <XCircle className="w-10 h-10 text-amber-600" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Cảnh báo vi phạm!</h2>
            <p className="text-slate-600 mb-6">
              Bạn đã rời khỏi màn hình làm bài. Đây là vi phạm lần 1. Nếu bạn tiếp tục vi phạm hoặc không quay lại trong <strong>{timeLeft}s</strong>, bài thi sẽ bị hủy.
            </p>
            <button 
              onClick={() => setShowWarning(false)}
              className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold py-4 px-8 rounded-xl transition-all"
            >
              Tôi đã hiểu, quay lại làm bài
            </button>
          </div>
        </div>
      )}

      <div className="mb-8 flex items-center justify-between">
        <button onClick={onCancel} className="text-slate-400 hover:text-slate-600 transition-colors flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" /> Thoát
        </button>
        <div className="text-sm font-bold text-slate-400">
          Câu {currentIndex + 1} / {questions.length}
        </div>
      </div>

      <div className="w-full h-2 bg-slate-100 rounded-full mb-12 overflow-hidden">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          className="h-full bg-indigo-600 rounded-full"
        />
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={currentIndex}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100"
        >
          {currentQuestion.imageUrl && (
            <img 
              src={currentQuestion.imageUrl} 
              alt="Question" 
              className="w-full h-64 object-cover rounded-2xl mb-8"
              referrerPolicy="no-referrer"
            />
          )}
          
          <h3 className="text-2xl font-bold text-slate-900 mb-8">{currentQuestion.text}</h3>

          <div className="grid grid-cols-1 gap-4 mb-12">
            {currentQuestion.options.map((option, idx) => (
              <button
                key={idx}
                onClick={() => handleAnswer(idx)}
                className={`w-full text-left p-6 rounded-2xl border-2 transition-all flex items-center justify-between group ${
                  answers[currentIndex] === idx 
                    ? 'border-indigo-600 bg-indigo-50 text-indigo-700' 
                    : 'border-slate-100 hover:border-slate-200 text-slate-600'
                }`}
              >
                <span className="font-medium">{option}</span>
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                  answers[currentIndex] === idx 
                    ? 'border-indigo-600 bg-indigo-600 text-white' 
                    : 'border-slate-200 group-hover:border-slate-300'
                }`}>
                  {answers[currentIndex] === idx && <CheckCircle2 className="w-4 h-4" />}
                </div>
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between gap-4">
            <button
              disabled={currentIndex === 0}
              onClick={() => setCurrentIndex(currentIndex - 1)}
              className="p-4 rounded-2xl text-slate-400 hover:text-slate-600 hover:bg-slate-50 disabled:opacity-0 transition-all"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>

            {currentIndex === questions.length - 1 ? (
              <button
                disabled={answers[currentIndex] === undefined || submitting}
                onClick={handleSubmit}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 text-white font-bold py-4 px-8 rounded-2xl transition-all shadow-lg shadow-indigo-100 flex items-center justify-center gap-2"
              >
                {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Nộp bài'}
              </button>
            ) : (
              <button
                disabled={answers[currentIndex] === undefined}
                onClick={() => setCurrentIndex(currentIndex + 1)}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 text-white font-bold py-4 px-8 rounded-2xl transition-all shadow-lg shadow-indigo-100 flex items-center justify-center gap-2"
              >
                Tiếp tục <ArrowRight className="w-5 h-5" />
              </button>
            )}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
