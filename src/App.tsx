import { useEffect, useState } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import Search from "./pages/Search";
import ManageRepairers from "./pages/ManageRepairers";
import { getClientPrincipal, type ClientPrincipal } from "./lib/api";

const ALLOWED_DOMAIN = "@autoprotectgroup.co.uk";

function navClass({ isActive }: { isActive: boolean }) {
  return `px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
    isActive ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-100"
  }`;
}

export default function App() {
  const [principal, setPrincipal] = useState<ClientPrincipal | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getClientPrincipal()
      .then(setPrincipal)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-slate-400">
        Loading&hellip;
      </div>
    );
  }

  if (!principal) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-gradient-to-br from-brand-50 to-slate-100 px-6 text-center">
        <h1 className="text-2xl font-semibold text-slate-800">Repairer Network Search</h1>
        <p className="max-w-sm text-slate-500">
          This tool is restricted to AutoProtect Group staff. Sign in with your
          @autoprotectgroup.co.uk account to continue.
        </p>
        <a
          href="/.auth/login/aad?post_login_redirect_uri=/"
          className="rounded-full bg-brand-600 px-6 py-3 font-medium text-white shadow-lg shadow-brand-600/30 transition hover:bg-brand-700"
        >
          Sign in with Microsoft
        </a>
      </div>
    );
  }

  if (!principal.userDetails.toLowerCase().endsWith(ALLOWED_DOMAIN)) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-gradient-to-br from-brand-50 to-slate-100 px-6 text-center">
        <h1 className="text-2xl font-semibold text-slate-800">Access restricted</h1>
        <p className="max-w-sm text-slate-500">
          This tool is restricted to AutoProtect Group staff. You're signed in as{" "}
          <strong>{principal.userDetails}</strong>, which isn't an{" "}
          {ALLOWED_DOMAIN} account.
        </p>
        <a
          href="/.auth/logout?post_logout_redirect_uri=/"
          className="rounded-full bg-brand-600 px-6 py-3 font-medium text-white shadow-lg shadow-brand-600/30 transition hover:bg-brand-700"
        >
          Sign out and try a different account
        </a>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
        <div className="flex items-center gap-6">
          <span className="text-lg font-semibold text-brand-700">Repairer Network</span>
          <nav className="flex gap-1">
            <NavLink to="/" end className={navClass}>
              Search
            </NavLink>
            <NavLink to="/manage" className={navClass}>
              Manage Repairers
            </NavLink>
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <span>{principal.userDetails}</span>
          <a href="/.auth/logout" className="font-medium text-brand-600 hover:underline">
            Sign out
          </a>
        </div>
      </header>
      <main className="min-h-0 flex-1">
        <Routes>
          <Route path="/" element={<Search />} />
          <Route path="/manage" element={<ManageRepairers />} />
        </Routes>
      </main>
    </div>
  );
}
