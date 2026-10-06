"use client";

import { useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";

type ModalState = {
  open: boolean;
  message: string;
};

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [modal, setModal] = useState<ModalState>({ open: false, message: "" });
  const loginInFlight = useRef(false);
  const shouldReduceMotion = useReducedMotion();

  function closeModal() {
    setModal((prev) => ({ ...prev, open: false }));
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (loginInFlight.current) return;
    loginInFlight.current = true;
    setIsLoading(true);
    let navigating = false;
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const result = await response.json().catch(() => null) as { erro?: string } | null;
        const retryAfter = Number(response.headers.get("Retry-After"));
        const retryMessage = Number.isFinite(retryAfter) && retryAfter > 0
          ? `Muitas tentativas. Tente novamente em ${Math.ceil(retryAfter / 60)} minuto${retryAfter > 60 ? "s" : ""}.`
          : null;
        setModal({ open: true, message: retryMessage ?? result?.erro ?? "Não foi possível entrar. Tente novamente." });
        return;
      }

      const result = await response.json() as { destino?: string };
      const destination = result.destino;
      if (!destination || !["/admin", "/caixa", "/cozinha", "/totem"].includes(destination)) {
        throw new Error("Destino de login inválido");
      }
      navigating = true;
      window.location.replace(destination);
    } catch {
      setModal({ open: true, message: "Não foi possível entrar. Verifique sua conexão e tente novamente." });
    } finally {
      if (!navigating) {
        loginInFlight.current = false;
        setIsLoading(false);
      }
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <motion.form initial={shouldReduceMotion ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.38, ease: "easeOut" }} onSubmit={handleLogin} className="w-full max-w-md rounded-3xl border border-border bg-card p-8 shadow-xl shadow-primary/10">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-black text-blue-600 mb-2">PIB Cantina</h1>
          <p className="text-gray-500">Faça login para acessar o sistema</p>
        </div>

        <div className="space-y-5">
          <div>
            <label htmlFor="login-email" className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
            <input
              id="login-email"
              name="email"
              required
              type="email"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="seu@email.com"
              className="w-full rounded-lg border border-slate-300 bg-white p-3 text-slate-950 placeholder:text-slate-400 shadow-sm transition-colors focus:border-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-100"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="login-password" className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
            <input
              id="login-password"
              name="password"
              required
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              className="w-full rounded-lg border border-slate-300 bg-white p-3 text-slate-950 placeholder:text-slate-400 shadow-sm transition-colors focus:border-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-100"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold text-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {isLoading ? "Entrando..." : "Entrar"}
          </button>
        </div>
      </motion.form>

      {/* Modal */}
      {modal.open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={closeModal}
        >
          <div
            role="alertdialog"
            aria-labelledby="login-error-title"
            aria-describedby="login-error-message"
            className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full mx-4 animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col items-center text-center gap-4">
              <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
                <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h2 id="login-error-title" className="text-xl font-bold text-gray-800">Erro no login</h2>
              <p id="login-error-message" className="text-gray-500">{modal.message}</p>
              <button
                type="button"
                onClick={closeModal}
                className="mt-2 w-full bg-red-600 text-white py-2.5 rounded-lg font-semibold hover:bg-red-700 transition-colors"
              >
                Tentar novamente
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
