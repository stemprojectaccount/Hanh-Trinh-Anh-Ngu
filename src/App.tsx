import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult } from 'firebase/auth';
import { doc, getDoc, onSnapshot, collection, query, orderBy, setDoc } from 'firebase/firestore';
import { auth, db, logout } from './firebase';
import { User, Quiz, Submission } from './types';
import { LogIn, LogOut, BookOpen, History, LayoutDashboard, Loader2, ChevronRight, GraduationCap, UserPlus, ShieldAlert } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import QuizView from './components/QuizView';
import StudentHistory from './components/StudentHistory';
import AdminDashboard from './components/AdminDashboard';
import { NotificationBell } from './components/NotificationBell';

type View = 'quizzes' | 'quiz' | 'history' | 'admin';

interface StudentInfo {
  name: string;
  className: string;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [studentInfo, setStudentInfo] = useState<StudentInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('quizzes');
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [selectedQuiz, setSelectedQuiz] = useState<Quiz | null>(null);
  const [showTeacherLogin, setShowTeacherLogin] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [classInput, setClassInput] = useState('');

  // Teacher login/register state
  const [loginId, setLoginId] = useState('');
  const [teacherUsername, setTeacherUsername] = useState('');
  const [teacherPassword, setTeacherPassword] = useState('');
  const [teacherName, setTeacherName] = useState('');
  const [authError, setAuthError] = useState('');

  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  useEffect(() => {
    let unsubscribeUser: () => void;
    
    // Handle redirect result
    getRedirectResult(auth).then((result) => {
      if (result) {
        handleGoogleLoginResult(result);
      }
    }).catch((error) => {
      console.error('Redirect auth error:', error);
      setAuthError(error.message || 'Lỗi đăng nhập Google. Vui lòng thử lại.');
    });

    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        unsubscribeUser = onSnapshot(doc(db, 'users', firebaseUser.uid), (userDoc) => {
          if (userDoc.exists()) {
            setUser(userDoc.data() as User);
          } else {
            setUser(null);
          }
          setLoading(false);
        }, (error) => {
          console.error("Error fetching user:", error);
          setLoading(false);
        });
      } else {
        setUser(null);
        setLoading(false);
        if (unsubscribeUser) unsubscribeUser();
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeUser) unsubscribeUser();
    };
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'quizzes'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const quizList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Quiz));
      quizList.sort((a, b) => {
        const timeA = a.createdAt?.toMillis?.() || 0;
        const timeB = b.createdAt?.toMillis?.() || 0;
        return timeB - timeA;
      });
      setQuizzes(quizList);
    }, (error) => {
      console.error("Error fetching quizzes:", error);
    });
    return () => unsubscribe();
  }, []);

  const handleStudentEnter = (e: React.FormEvent) => {
    e.preventDefault();
    if (nameInput.trim() && classInput.trim()) {
      setStudentInfo({ name: nameInput, className: classInput });
    }
  };

  const handleTeacherAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    try {
      if (isRegistering) {
        // Check if username already exists
        const usernameDoc = await getDoc(doc(db, 'usernames', teacherUsername));
        if (usernameDoc.exists()) {
          throw new Error('Tên đăng nhập này đã tồn tại. Vui lòng chọn tên khác.');
        }

        const sanitizedUsername = teacherUsername.toLowerCase().replace(/[^a-z0-9]/g, '');
        const generatedEmail = `${sanitizedUsername}_${Date.now()}@teacher.local`;

        const userCredential = await createUserWithEmailAndPassword(auth, generatedEmail, teacherPassword);
        const newUser: User = {
          uid: userCredential.user.uid,
          email: generatedEmail,
          username: teacherUsername,
          displayName: teacherName,
          photoURL: null,
          role: 'admin',
          status: 'pending'
        };
        await setDoc(doc(db, 'users', userCredential.user.uid), newUser);
        await setDoc(doc(db, 'usernames', teacherUsername), { email: generatedEmail });
        setUser(newUser);
        
        alert('Yêu cầu tạo tài khoản đã được gửi. Vui lòng đợi quản trị viên phê duyệt.');
      } else {
        let emailToLogin = loginId;
        
        // Auto-bootstrap the requested admin account
        if (loginId === 'Trần Thành Đạt' && teacherPassword === 'admin123456') {
          emailToLogin = 'admin@tranthanhdat.local';
          try {
            const cred = await createUserWithEmailAndPassword(auth, emailToLogin, teacherPassword);
            const newUser: User = {
              uid: cred.user.uid,
              email: emailToLogin,
              username: 'Trần Thành Đạt',
              displayName: 'Trần Thành Đạt',
              photoURL: null,
              role: 'admin',
              status: 'approved'
            };
            await setDoc(doc(db, 'users', cred.user.uid), newUser);
            await setDoc(doc(db, 'usernames', 'Trần Thành Đạt'), { email: emailToLogin });
            setUser(newUser);
            return;
          } catch (err: any) {
            if (err.code !== 'auth/email-already-in-use') {
              throw err;
            }
            // If already exists, update the username mapping just in case, then proceed to login
            await setDoc(doc(db, 'usernames', 'Trần Thành Đạt'), { email: emailToLogin });
          }
        } else if (!loginId.includes('@')) {
          const usernameDoc = await getDoc(doc(db, 'usernames', loginId));
          if (usernameDoc.exists()) {
            emailToLogin = usernameDoc.data().email;
          } else {
            throw new Error('Không tìm thấy tên đăng nhập này.');
          }
        }
        
        await signInWithEmailAndPassword(auth, emailToLogin, teacherPassword);
      }
    } catch (error: any) {
      console.error('Auth error:', error);
      setAuthError(error.message || 'Lỗi xác thực. Vui lòng thử lại.');
    }
  };

  const handleGoogleLogin = async () => {
    if (isGoogleLoading) return;
    try {
      setIsGoogleLoading(true);
      setAuthError('');
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      
      try {
        const result = await signInWithPopup(auth, provider);
        await handleGoogleLoginResult(result);
      } catch (popupError: any) {
        if (popupError.code === 'auth/popup-blocked') {
          setAuthError('Trình duyệt đã chặn cửa sổ đăng nhập. Vui lòng cho phép hiển thị cửa sổ bật lên (popup) cho trang web này và thử lại.');
        } else if (popupError.code === 'auth/cancelled-popup-request') {
          // User closed the popup, just ignore or show a message
          setAuthError('Đăng nhập bị hủy.');
        } else {
          throw popupError;
        }
      }
    } catch (error: any) {
      console.error('Google Auth error:', error);
      setAuthError(error.message || 'Lỗi đăng nhập Google. Vui lòng thử lại.');
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleGoogleLoginResult = async (result: any) => {
    const userDoc = await getDoc(doc(db, 'users', result.user.uid));
    if (!userDoc.exists()) {
      const newUser: User = {
        uid: result.user.uid,
        email: result.user.email,
        username: result.user.displayName || result.user.email?.split('@')[0] || 'Unknown',
        displayName: result.user.displayName,
        photoURL: result.user.photoURL,
        role: 'admin',
        status: result.user.email === 'pn9055162@gmail.com' ? 'approved' : 'pending'
      };
      await setDoc(doc(db, 'users', result.user.uid), newUser);
      await setDoc(doc(db, 'usernames', newUser.username), { email: result.user.email });
    }
  };

  const handleStartQuiz = (quiz: Quiz) => {
    setSelectedQuiz(quiz);
    setView('quiz');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (!user && !studentInfo) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 text-center border border-slate-100"
        >
          <div className="w-16 h-16 bg-indigo-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <GraduationCap className="w-8 h-8 text-indigo-600" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Hành Trình Anh Ngữ</h1>
          <p className="text-slate-500 mb-8">Nâng cao trình độ tiếng Anh của bạn.</p>
          
          <AnimatePresence mode="wait">
            {!showTeacherLogin ? (
              <motion.div
                key="student-login"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.2 }}
              >
                <form onSubmit={handleStudentEnter} className="space-y-4">
                  <input
                    type="text"
                    placeholder="Họ và tên của bạn"
                    value={nameInput}
                    onChange={e => setNameInput(e.target.value)}
                    className="w-full p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-600 outline-none transition-all"
                    required
                  />
                  <input
                    type="text"
                    placeholder="Lớp (Ví dụ: 10A1)"
                    value={classInput}
                    onChange={e => setClassInput(e.target.value)}
                    className="w-full p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-600 outline-none transition-all"
                    required
                  />
                  <button
                    type="submit"
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-4 px-6 rounded-2xl transition-all shadow-lg shadow-indigo-200 active:scale-95"
                  >
                    Vào học ngay
                  </button>
                </form>
                <button
                  type="button"
                  onClick={() => setShowTeacherLogin(true)}
                  className="text-sm text-slate-400 hover:text-indigo-600 transition-colors mt-6"
                >
                  Dành cho giáo viên
                </button>
              </motion.div>
            ) : (
              <motion.div
                key="teacher-login"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
              >
                <form onSubmit={handleTeacherAuth} className="space-y-4">
                  <AnimatePresence mode="wait">
                    {isRegistering ? (
                      <motion.div
                        key="register-fields"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="space-y-4 overflow-hidden"
                      >
                        <input
                          type="text"
                          placeholder="Tên đăng nhập"
                          value={teacherUsername}
                          onChange={e => setTeacherUsername(e.target.value)}
                          className="w-full p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-600 outline-none transition-all"
                          required
                        />
                        <input
                          type="text"
                          placeholder="Họ và tên giáo viên"
                          value={teacherName}
                          onChange={e => setTeacherName(e.target.value)}
                          className="w-full p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-600 outline-none transition-all"
                          required
                        />
                      </motion.div>
                    ) : (
                      <motion.div
                        key="login-fields"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <input
                          type="text"
                          placeholder="Tên đăng nhập"
                          value={loginId}
                          onChange={e => setLoginId(e.target.value)}
                          className="w-full p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-600 outline-none transition-all"
                          required
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <input
                    type="password"
                    placeholder="Mật khẩu"
                    value={teacherPassword}
                    onChange={e => setTeacherPassword(e.target.value)}
                    className="w-full p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-600 outline-none transition-all"
                    required
                  />
                  {authError && (
                    <motion.p 
                      initial={{ opacity: 0 }} 
                      animate={{ opacity: 1 }} 
                      className="text-red-500 text-sm"
                    >
                      {authError}
                    </motion.p>
                  )}
                  <button
                    type="submit"
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-4 px-6 rounded-2xl transition-all shadow-lg shadow-indigo-200 active:scale-95 flex items-center justify-center gap-2"
                  >
                    {isRegistering ? <UserPlus className="w-5 h-5" /> : <LogIn className="w-5 h-5" />}
                    {isRegistering ? 'Tạo tài khoản' : 'Đăng nhập'}
                  </button>

                  <div className="relative flex items-center py-2">
                    <div className="flex-grow border-t border-slate-200"></div>
                    <span className="flex-shrink-0 mx-4 text-slate-400 text-sm">Hoặc</span>
                    <div className="flex-grow border-t border-slate-200"></div>
                  </div>

                  <button
                    type="button"
                    onClick={handleGoogleLogin}
                    disabled={isGoogleLoading}
                    className="w-full bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold py-4 px-6 rounded-2xl transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isGoogleLoading ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <svg className="w-5 h-5" viewBox="0 0 24 24">
                        <path
                          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                          fill="#4285F4"
                        />
                        <path
                          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                          fill="#34A853"
                        />
                        <path
                          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                          fill="#FBBC05"
                        />
                        <path
                          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                          fill="#EA4335"
                        />
                      </svg>
                    )}
                    {isGoogleLoading ? 'Đang kết nối...' : 'Đăng nhập bằng Google'}
                  </button>
                  
                  <div className="mt-4 p-4 bg-blue-50 rounded-xl border border-blue-100">
                    <p className="text-sm text-blue-800 text-center">
                      Gmail mẫu tk quản trị viên là:<br/>
                      <span className="font-bold">pn9055162@gmail.com</span>
                    </p>
                  </div>
                </form>
                <div className="flex flex-col gap-3 mt-6">
                  <button
                    type="button"
                    onClick={() => {
                      setIsRegistering(!isRegistering);
                      setAuthError('');
                    }}
                    className="text-sm text-indigo-600 hover:underline font-medium"
                  >
                    {isRegistering ? 'Đã có tài khoản? Đăng nhập' : 'Chưa có tài khoản? Tạo tài khoản'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowTeacherLogin(false);
                      setAuthError('');
                    }}
                    className="text-sm text-slate-400 hover:text-indigo-600 transition-colors"
                  >
                    Quay lại phần học sinh
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    );
  }

  const isApproved = user?.status === 'approved' || user?.email === 'pn9055162@gmail.com' || user?.username === 'Trần Thành Đạt';

  return (
    <div className={`min-h-screen bg-slate-50 pb-20 md:pb-0 ${user ? 'md:pl-20' : ''}`}>
      {/* Sidebar / Bottom Nav (Only for logged in users/teachers) */}
      {user && (
        <nav className="fixed bottom-0 left-0 right-0 md:top-0 md:bottom-0 md:w-20 bg-white border-t md:border-t-0 md:border-r border-slate-200 z-50 flex md:flex-col items-center justify-around md:justify-center gap-8 p-4">
          <button 
            onClick={() => setView('quizzes')}
            className={`p-3 rounded-2xl transition-all ${view === 'quizzes' || view === 'quiz' ? 'bg-indigo-100 text-indigo-600' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`}
            title="Bài kiểm tra"
          >
            <BookOpen className="w-6 h-6" />
          </button>
          <button 
            onClick={() => setView('history')}
            className={`p-3 rounded-2xl transition-all ${view === 'history' ? 'bg-indigo-100 text-indigo-600' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`}
            title="Lịch sử"
          >
            <History className="w-6 h-6" />
          </button>
          {user.role === 'admin' && isApproved && (
            <button 
              onClick={() => setView('admin')}
              className={`p-3 rounded-2xl transition-all ${view === 'admin' ? 'bg-indigo-100 text-indigo-600' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`}
              title="Quản trị"
            >
              <LayoutDashboard className="w-6 h-6" />
            </button>
          )}
          <button 
            onClick={() => {
              logout();
              setStudentInfo(null);
            }}
            className="p-3 rounded-2xl text-slate-400 hover:text-red-600 hover:bg-red-50 transition-all md:mt-auto"
            title="Đăng xuất"
          >
            <LogOut className="w-6 h-6" />
          </button>
        </nav>
      )}

      {/* Main Content */}
      <main className={`max-w-5xl mx-auto p-6 md:p-12 ${!user ? 'pb-24' : ''}`}>
        {user && !isApproved && (
          <div className="bg-white rounded-3xl p-12 text-center border border-slate-100 shadow-sm mb-12">
            <ShieldAlert className="w-16 h-16 text-yellow-500 mx-auto mb-6" />
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Tài khoản đang chờ duyệt</h2>
            <p className="text-slate-500 mb-8">Tài khoản của bạn đang được quản trị viên xem xét. Vui lòng quay lại sau.</p>
            <button 
              onClick={() => logout()}
              className="px-8 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl transition-all"
            >
              Đăng xuất
            </button>
          </div>
        )}

        <header className="mb-12 flex items-center justify-between">
          <div>
            <h2 className="text-4xl font-bold text-slate-900 mb-2">Hành Trình Anh Ngữ</h2>
            <p className="text-slate-500">
              {view === 'history' ? 'Lịch sử học tập của bạn' : 
               view === 'admin' ? 'Quản trị hệ thống' :
               `Chào mừng ${user?.displayName || studentInfo?.name}, hãy chọn một bài kiểm tra để bắt đầu.`}
            </p>
          </div>
          <div className="flex items-center gap-4">
            {(user?.role === 'admin' || studentInfo) && (
              <NotificationBell 
                isAdmin={user?.role === 'admin'} 
                studentName={studentInfo?.name} 
                studentClass={studentInfo?.className} 
              />
            )}
            {!user && studentInfo && (
              <button 
                onClick={() => setView(view === 'history' ? 'quizzes' : 'history')}
                className={`p-3 rounded-2xl transition-all ${view === 'history' ? 'bg-indigo-100 text-indigo-600' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`}
                title="Lịch sử"
              >
                <History className="w-6 h-6" />
              </button>
            )}
            {!user && studentInfo && (
              <button 
                onClick={() => setStudentInfo(null)}
                className="p-3 rounded-2xl text-slate-400 hover:text-red-600 hover:bg-red-50 transition-all"
                title="Thoát"
              >
                <LogOut className="w-6 h-6" />
              </button>
            )}
          </div>
        </header>

        <AnimatePresence mode="wait">
          {view === 'quizzes' && (isApproved || !user) && (
            <motion.div
              key="quizzes"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >




              {quizzes.length === 0 ? (
                <div className="bg-white rounded-3xl p-12 text-center border border-dashed border-slate-300">
                  <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                  <p className="text-slate-500">Chưa có bài kiểm tra nào được tạo.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {quizzes.map((quiz) => (
                    <motion.div
                      key={quiz.id}
                      whileHover={{ scale: 1.02 }}
                      className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 flex flex-col gap-4 cursor-pointer group"
                      onClick={() => handleStartQuiz(quiz)}
                    >
                      {quiz.imageUrl && (
                        <img 
                          src={quiz.imageUrl} 
                          alt={quiz.title} 
                          className="w-full h-48 object-cover rounded-2xl mb-2"
                          referrerPolicy="no-referrer"
                        />
                      )}
                      <div>
                        <h3 className="text-xl font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">{quiz.title}</h3>
                        <p className="text-slate-500 mt-1">{quiz.description}</p>
                      </div>
                      <div className="mt-auto flex items-center justify-between pt-4 border-t border-slate-50">
                        <span className="text-sm font-medium text-slate-400">Bắt đầu ngay</span>
                        <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-all">
                          <ChevronRight className="w-5 h-5" />
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {view === 'quiz' && selectedQuiz && (
            <QuizView 
              key="quiz"
              quiz={selectedQuiz} 
              user={user} 
              studentInfo={studentInfo}
              onComplete={() => setView('history')}
              onCancel={() => setView('quizzes')}
            />
          )}

          {view === 'history' && (
            <StudentHistory key="history" user={user} studentInfo={studentInfo} />
          )}

          {view === 'admin' && user?.role === 'admin' && user.status === 'approved' && (
            <AdminDashboard key="admin" user={user} />
          )}
          {view === 'admin' && user?.role === 'admin' && user.status === 'pending' && (
            <div className="flex flex-col items-center justify-center p-20 text-center">
              <ShieldAlert className="w-16 h-16 text-amber-500 mb-4" />
              <h2 className="text-2xl font-bold text-slate-900 mb-2">Tài khoản đang chờ duyệt</h2>
              <p className="text-slate-500">Vui lòng liên hệ quản trị viên để được cấp quyền truy cập.</p>
            </div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
