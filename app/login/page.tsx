"use client";

import { useState } from "react";
import { supabase } from "../../lib/supabase";

type ModalType = "error" | "success" | null;

interface ModalState {
  type: ModalType;
  title: string;
  message: string;
}

function LoginModal({
  modal,
  onClose,
}: {
  modal: ModalState;
  onClose: () => void;
}) {
  if (!modal.type) return null;

  const isSuccess = modal.type === "success";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.45)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          animation: "modalIn 0.25s cubic-bezier(0.34,1.56,0.64,1) both",
        }}
      >
        {/* Colored top bar */}
        <div
          className="h-1.5 w-full"
          style={{
            background: isSuccess
              ? "linear-gradient(90deg,#22c55e,#16a34a)"
              : "linear-gradient(90deg,#ef4444,#dc2626)",
          }}
        />

        <div className="p-7 text-center">
          {/* Icon */}
          <div
            className="mx-auto mb-4 flex items-center justify-center rounded-full w-16 h-16"
            style={{
              background: isSuccess
                ? "linear-gradient(135deg,#dcfce7,#bbf7d0)"
                : "linear-gradient(135deg,#fee2e2,#fecaca)",
            }}
          >
            {isSuccess ? (
              <svg
                className="w-8 h-8"
                style={{ color: "#16a34a" }}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                />
              </svg>
            ) : (
              <svg
                className="w-8 h-8"
                style={{ color: "#dc2626" }}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
                />
              </svg>
            )}
          </div>

          <h2
            className="text-xl font-bold mb-2"
            style={{ color: isSuccess ? "#15803d" : "#b91c1c" }}
          >
            {modal.title}
          </h2>
          <p className="text-gray-500 text-sm leading-relaxed">{modal.message}</p>
        </div>

        <div className="px-7 pb-6">
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl font-semibold text-white transition-all duration-150 active:scale-95"
            style={{
              background: isSuccess
                ? "linear-gradient(135deg,#22c55e,#16a34a)"
                : "linear-gradient(135deg,#ef4444,#dc2626)",
              boxShadow: isSuccess
                ? "0 4px 14px rgba(34,197,94,0.35)"
                : "0 4px 14px rgba(239,68,68,0.35)",
            }}
          >
            {isSuccess ? "Acessar sistema" : "Tentar novamente"}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes modalIn {
          from { opacity: 0; transform: scale(0.85) translateY(16px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [modal, setModal] = useState<ModalState>({ type: null, title: "", message: "" });

  function closeModal() {
    if (modal.type === "success") {
      window.location.href = "/admin";
    }
    setModal({ type: null, title: "", message: "" });
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    setIsLoading(false);

    if (error) {
      setModal({
        type: "error",
        title: "Falha no login",
        message: "Usuário ou senha incorretos. Verifique suas credenciais e tente novamente.",
      });
    } else {
      setModal({
        type: "success",
        title: "Login realizado!",
        message: "Bem-vindo ao sistema da cantina. Redirecionando...",
      });
    }
  }

  return (
    <>
      <LoginModal modal={modal} onClose={closeModal} />

      <div className="flex h-screen items-center justify-center bg-gray-50">
        <form
          onSubmit={handleLogin}
          className="bg-white p-8 rounded-2xl shadow-xl border border-gray-100 w-full max-w-md"
        >
          <div className="text-center mb-8">
            <h1 className="text-3xl font-black text-blue-600 mb-2">PIB Cantina</h1>
            <p className="text-gray-500">Faça login para acessar o sistema</p>
          </div>

          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
              <input
                required
                type="email"
                placeholder="seu@email.com"
                className="w-full border-2 p-3 rounded-lg focus:border-blue-500 focus:outline-none transition-colors text-black"
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
              <input
                required
                type="password"
                placeholder="••••••••"
                className="w-full border-2 p-3 rounded-lg focus:border-blue-500 focus:outline-none transition-colors text-black"
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
        </form>
      </div>
    </>
  );
}