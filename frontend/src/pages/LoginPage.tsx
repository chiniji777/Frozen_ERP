import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const { user, login, loading } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [locked, setLocked] = useState(false);
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (loading) return null;
  if (user) return <Navigate to="/" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLocked(false);
    setRemainingAttempts(null);
    setSubmitting(true);
    try {
      await login(username, password);
    } catch (err: unknown) {
      const loginErr = err as Error & { locked?: boolean; remainingAttempts?: number; retryAfterMs?: number };
      setError(loginErr.message || 'เข้าสู่ระบบไม่สำเร็จ');
      if (loginErr.locked) setLocked(true);
      if (loginErr.remainingAttempts != null) setRemainingAttempts(loginErr.remainingAttempts);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-500 to-blue-600 p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-8">
        <h1 className="text-2xl font-bold text-center text-indigo-900 mb-2">
          🏢 Nut Office ERP
        </h1>
        <p className="text-center text-gray-500 mb-6 text-sm">เข้าสู่ระบบ</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
              ชื่อผู้ใช้
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="username"
              autoComplete="username"
              required
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              รหัสผ่าน
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="password"
              autoComplete="current-password"
              required
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
          </button>

          {error && (
            <div className={`text-sm px-4 py-2 rounded-lg text-center ${locked ? 'bg-orange-50 text-orange-700 border border-orange-200' : 'bg-red-50 text-red-600'}`}>
              <p>{error}</p>
              {remainingAttempts != null && remainingAttempts > 0 && !locked && (
                <p className="mt-1 text-xs text-orange-600">
                  เหลือโอกาสอีก {remainingAttempts} ครั้งก่อนบัญชีถูกล็อค
                </p>
              )}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
