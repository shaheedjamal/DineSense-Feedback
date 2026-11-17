import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function Navbar() {
  const { user } = useAuth();

  const dashboardPath = user?.role === 'super_admin' ? '/admin' : '/dashboard';

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-8 px-6 py-4">
        <Link
          to="/"
          className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
        >
          DineSense Feedback
        </Link>

        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
          <a
            href="/#how-it-works"
            className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
          >
            How It Works
          </a>
          <a
            href="/#capabilities"
            className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
          >
            Capabilities
          </a>
          <a
            href="/#privacy"
            className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
          >
            Privacy Standards
          </a>
          <Link
            to="/feedback"
            className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
          >
            Guest Kiosk
          </Link>
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          <Link
            to={user ? dashboardPath : '/login'}
            className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 min-h-[40px]"
          >
            {user ? 'Open Console' : 'Staff Login'}
          </Link>
        </div>
      </div>
    </header>
  );
}
