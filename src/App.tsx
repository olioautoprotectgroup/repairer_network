import { useEffect, useState } from "react";
import { Link, NavLink, Route, Routes } from "react-router-dom";
import Search from "./pages/Search";
import ManageRepairers from "./pages/ManageRepairers";
import TyrePriceCheck from "./pages/TyrePriceCheck";
import { getClientPrincipal, type ClientPrincipal } from "./lib/api";
import logo from "./assets/autoprotect-logo.png";

const ALLOWED_DOMAIN = "@autoprotectgroup.co.uk";

/**
 * Manage Repairers is restricted to the owner of the repairer data; the rest
 * of the domain gets Search only. Kept in hand-sync with REPAIRER_MANAGERS
 * in api/src/lib/auth.ts, which is the actual enforcement -- hiding the nav
 * link and the route here is UX, same as the ALLOWED_DOMAIN check below.
 * (The frontend and the API are separate packages with no shared module,
 * which is why ALLOWED_DOMAIN is duplicated across them too.)
 */
const REPAIRER_MANAGERS = [
  "jake.quaradeghini@autoprotectgroup.co.uk",
  "oliver.oakes@autoprotectgroup.co.uk",
];

function navClass({ isActive }: { isActive: boolean }) {
  return `px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
    isActive ? "bg-white/15 text-white" : "text-brand-100 hover:bg-white/10 hover:text-white"
  }`;
}

/**
 * Shown instead of Manage Repairers to anyone outside REPAIRER_MANAGERS. The
 * route stays registered rather than being dropped, so a colleague's old
 * bookmark explains itself instead of landing on an empty page.
 */
function ManageRepairersRestricted() {
  return (
    <div className="mx-auto max-w-md p-10 text-center">
      <h1 className="text-lg font-semibold text-slate-800">Manage Repairers isn't available</h1>
      <p className="mt-2 text-sm text-slate-600">
        Adding and editing repairers is restricted to the owner of the repairer network. If a
        repairer needs adding or correcting, ask them to make the change.
      </p>
      <Link
        to="/"
        className="mt-5 inline-block rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
      >
        Back to search
      </Link>
    </div>
  );
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
      <div className="flex h-full items-center justify-center bg-brand-600 text-brand-200">
        Loading&hellip;
      </div>
    );
  }

  if (!principal) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-5 bg-gradient-to-br from-brand-600 to-brand-800 px-6 text-center">
        <img src={logo} alt="AutoProtect" className="h-24 w-auto" />
        <h1 className="text-2xl font-black text-white">Repairer Network Search</h1>
        <p className="max-w-sm text-brand-100">
          This tool is restricted to AutoProtect Group staff. Sign in with your
          @autoprotectgroup.co.uk account to continue.
        </p>
        <a
          href="/.auth/login/aad?post_login_redirect_uri=/"
          className="rounded-full bg-highlight px-6 py-3 font-bold text-white shadow-lg shadow-black/20 transition hover:brightness-110"
        >
          Sign in with Microsoft
        </a>
      </div>
    );
  }

  if (!principal.userDetails.toLowerCase().endsWith(ALLOWED_DOMAIN)) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-5 bg-gradient-to-br from-brand-600 to-brand-800 px-6 text-center">
        <img src={logo} alt="AutoProtect" className="h-24 w-auto" />
        <h1 className="text-2xl font-black text-white">Access restricted</h1>
        <p className="max-w-sm text-brand-100">
          This tool is restricted to AutoProtect Group staff. You're signed in as{" "}
          <strong className="text-white">{principal.userDetails}</strong>, which isn't an{" "}
          {ALLOWED_DOMAIN} account.
        </p>
        <a
          href="/.auth/logout?post_logout_redirect_uri=/"
          className="rounded-full bg-highlight px-6 py-3 font-bold text-white shadow-lg shadow-black/20 transition hover:brightness-110"
        >
          Sign out and try a different account
        </a>
      </div>
    );
  }

  const canManageRepairers = REPAIRER_MANAGERS.includes(principal.userDetails.toLowerCase());

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between bg-brand-600 px-6 py-2.5 shadow-sm">
        <div className="flex items-center gap-6">
          <img src={logo} alt="AutoProtect" className="h-9 w-auto" />
          <span className="hidden text-sm font-bold uppercase tracking-wide text-brand-100 sm:inline">
            Repairer Network
          </span>
          <nav className="flex gap-1">
            <NavLink to="/" end className={navClass}>
              Search
            </NavLink>
            {canManageRepairers && (
              <NavLink to="/manage" className={navClass}>
                Manage Repairers
              </NavLink>
            )}
            {/*
              Tyre Price Check is deliberately not linked in the nav yet. The
              route below still works for anyone who knows the URL, so it can
              be demoed -- but until Databricks is live and
              TYRE_PRICE_HALFORDS_ENABLED is set, every lookup honestly
              reports "Not yet enabled" and returns no prices, which reads as
              a broken page rather than an unfinished one. Restore this link
              when the first retailer goes live.
            */}
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm text-brand-100">
          <span>{principal.userDetails}</span>
          <a href="/.auth/logout" className="font-medium text-white hover:underline">
            Sign out
          </a>
        </div>
      </header>
      <main className="min-h-0 flex-1">
        <Routes>
          <Route
            path="/"
            element={
              <Search
                currentUserEmail={principal.userDetails.toLowerCase()}
                canModerate={canManageRepairers}
              />
            }
          />
          <Route
            path="/manage"
            element={canManageRepairers ? <ManageRepairers /> : <ManageRepairersRestricted />}
          />
          <Route path="/tyre-price" element={<TyrePriceCheck />} />
        </Routes>
      </main>
    </div>
  );
}
