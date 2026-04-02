import React, { useState, useEffect } from 'react';
import { collection, query, where, orderBy, onSnapshot, doc, getDoc, getDocs } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Submission, User, Question, Quiz } from '../types';
import { History, ChevronRight, CheckCircle2, XCircle, ArrowLeft, Loader2, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';

interface StudentHistoryProps {
  user: User | null;
  studentInfo: { name: string; className: string } | null;
}

export default function StudentHistory({ user, studentInfo }: StudentHistoryProps) {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);

  useEffect(() => {
    let q;
    if (user) {
      q = query(
        collection(db, 'submissions'),
        where('studentId', '==', user.uid),
        orderBy('createdAt', 'desc')
      );
    } else if (studentInfo) {
      q = query(
        collection(db, 'submissions'),
        where('studentName', '==', studentInfo.name),
        where('studentClass', '==', studentInfo.className),
        orderBy('createdAt', 'desc')
      );
    } else {
      setLoading(false);
      return;
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const submissionList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Submission));
      setSubmissions(submissionList);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'submissions');
    });

    return () => unsubscribe();
  }, [user?.uid, studentInfo?.name, studentInfo?.className]);

  const handleViewDetails = async (submission: Submission) => {
    setLoadingQuestions(true);
    setSelectedSubmission(submission);
    
    try {
      const q = query(collection(db, 'quizzes', submission.quizId, 'questions'));
      const snapshot = await getDocs(q);
      const questionList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Question));
      questionList.sort((a, b) => {
        const timeA = a.createdAt?.toMillis?.() || 0;
        const timeB = b.createdAt?.toMillis?.() || 0;
        return timeA - timeB;
      });
      setQuestions(questionList);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, `quizzes/${submission.quizId}/questions`);
    } finally {
      setLoadingQuestions(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-20">
        <Loader2 className="w-12 h-12 animate-spin text-indigo-600 mb-4" />
        <p className="text-slate-500">Đang tải lịch sử...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <AnimatePresence mode="wait">
        {!selectedSubmission ? (
          <motion.div
            key="list"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
          >
            <header className="mb-12">
              <h2 className="text-4xl font-bold text-slate-900 mb-2">Lịch sử học tập</h2>
              <p className="text-slate-500">Xem lại các bài kiểm tra bạn đã hoàn thành.</p>
            </header>

            {submissions.length === 0 ? (
              <div className="bg-white rounded-3xl p-12 text-center border border-dashed border-slate-300">
                <History className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-500">Bạn chưa thực hiện bài kiểm tra nào.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {submissions.map((sub) => (
                  <motion.div
                    key={sub.id}
                    whileHover={{ scale: 1.01 }}
                    onClick={() => handleViewDetails(sub)}
                    className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 flex items-center justify-between cursor-pointer group"
                  >
                    <div className="flex items-center gap-6">
                      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center font-bold text-xl ${
                        (sub.score / sub.totalQuestions) >= 0.8 ? 'bg-emerald-100 text-emerald-600' : 
                        (sub.score / sub.totalQuestions) >= 0.5 ? 'bg-yellow-100 text-yellow-600' : 
                        'bg-red-100 text-red-600'
                      }`}>
                        {Math.round((sub.score / sub.totalQuestions) * 100)}%
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">{sub.quizTitle}</h3>
                        <p className="text-sm text-slate-400">
                          {sub.createdAt?.toDate().toLocaleDateString('vi-VN')} · {sub.score}/{sub.totalQuestions} câu đúng
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-indigo-600 transition-all" />
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="details"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            <button 
              onClick={() => setSelectedSubmission(null)}
              className="mb-8 text-slate-400 hover:text-slate-600 transition-colors flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" /> Quay lại danh sách
            </button>

            <header className="mb-12">
              <h2 className="text-3xl font-bold text-slate-900 mb-2">{selectedSubmission.quizTitle}</h2>
              <p className="text-slate-500">Chi tiết kết quả và giải thích đáp án.</p>
              {selectedSubmission.note && (
                <div className="mt-4 bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
                  <XCircle className="w-6 h-6 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-bold text-red-900">Ghi chú từ hệ thống</h4>
                    <p className="text-red-700">{selectedSubmission.note}</p>
                  </div>
                </div>
              )}
            </header>

            {loadingQuestions ? (
              <div className="flex flex-col items-center justify-center p-20">
                <Loader2 className="w-12 h-12 animate-spin text-indigo-600 mb-4" />
                <p className="text-slate-500">Đang tải chi tiết...</p>
              </div>
            ) : (
              <div className="space-y-8">
                {questions.map((q, i) => {
                  const userAnswer = selectedSubmission.answers[i];
                  const isCorrect = userAnswer === q.correctOptionIndex;

                  return (
                    <div key={q.id} className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100">
                      <div className="flex items-start justify-between gap-4 mb-6">
                        <h4 className="text-xl font-bold text-slate-900">Câu {i + 1}: {q.text}</h4>
                        {isCorrect ? (
                          <div className="flex items-center gap-1 text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full text-sm font-bold">
                            <CheckCircle2 className="w-4 h-4" /> Đúng
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 text-red-600 bg-red-50 px-3 py-1 rounded-full text-sm font-bold">
                            <XCircle className="w-4 h-4" /> Sai
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-1 gap-3 mb-8">
                        {q.options.map((opt, idx) => (
                          <div 
                            key={idx}
                            className={`p-4 rounded-xl border-2 flex items-center justify-between ${
                              idx === q.correctOptionIndex 
                                ? 'border-emerald-500 bg-emerald-50 text-emerald-700' 
                                : idx === userAnswer 
                                  ? 'border-red-500 bg-red-50 text-red-700' 
                                  : 'border-slate-50 text-slate-500'
                            }`}
                          >
                            <span className="font-medium">{opt}</span>
                            {idx === q.correctOptionIndex && <CheckCircle2 className="w-5 h-5" />}
                            {idx === userAnswer && idx !== q.correctOptionIndex && <XCircle className="w-5 h-5" />}
                          </div>
                        ))}
                      </div>

                      <div className="bg-indigo-50 rounded-2xl p-6 border border-indigo-100">
                        <div className="flex items-center gap-2 text-indigo-700 font-bold mb-3">
                          <Info className="w-5 h-5" />
                          Giải thích đáp án
                        </div>
                        <div className="markdown-body">
                          <ReactMarkdown>{q.explanation}</ReactMarkdown>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
