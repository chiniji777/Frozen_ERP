import { useState, useEffect, useCallback, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: Record<string, unknown>) => void;
          renderButton: (element: HTMLElement, config: Record<string, unknown>) => void;
        };
      };
    };
  }
}

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || 'PLACEHOLDER_CLIENT_ID';

export default function LoginPage() {
  const { user, loginWithGoogle, loading } = useAuth();
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const buttonRef = useRef<HTMLDivElement>(null);

  const handleCredentialResponse = useCallback(async (response: { credential: string }) => {
    setError('');
    setSubmitting(true);
    try {
      await loginWithGoogle(response.credential);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เข้าสู่ระบบไม่สำเร็จ');
    } finally {
      setSubmitting(false);
    }
  }, [loginWithGoogle]);

  useEffect(() => {
    if (user || loading) return;

    const initGSI = () => {
      if (!window.google || !buttonRef.current) return;

      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleCredentialResponse,
      });

      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: 'outline',
        size: 'large',
        width: 320,
        text: 'signin_with',
        shape: 'rectangular',
        logo_alignment: 'left',
      });
    };

    if (window.google) {
      initGSI();
    } else {
      const interval = setInterval(() => {
        if (window.google) {
          clearInterval(interval);
          initGSI();
        }
      }, 100);
      return () => clearInterval(interval);
    }
  }, [user, loading, handleCredentialResponse]);

  if (loading) return null;
  if (user) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-500 to-blue-600 p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-8">
        <h1 className="text-2xl font-bold text-center text-indigo-900 mb-2">
          🏢 Nut Office ERP
        </h1>
        <p className="text-center text-gray-500 mb-8 text-sm">เข้าสู่ระบบด้วย Google</p>

        <div className="flex flex-col items-center gap-4">
          {/* Google Sign-In Button */}
          <div ref={buttonRef} className="flex justify-center" />

          {submitting && (
            <p className="text-indigo-600 text-sm">กำลังเข้าสู่ระบบ...</p>
          )}

          {error && (
            <p className="text-red-600 text-sm bg-red-50 px-4 py-2 rounded-lg w-full text-center">
              {error}
            </p>
          )}
        </div>

        <p className="text-center text-gray-400 text-xs mt-8">
          เฉพาะอีเมลที่ได้รับอนุญาตเท่านั้น
        </p>
      </div>
    </div>
  );
}
