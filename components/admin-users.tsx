"use client";

import { useEffect, useState, type FormEvent } from "react";
import { LockKeyhole, Monitor, Store, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Account = { id: string; name: string; email: string; role: string; editable: boolean };
const labels: Record<string, string> = { admin: "Administrador", manager: "Gerente", cashier: "Caixa", kitchen: "Cozinha", totem: "Totem", cantina: "Cantina" };

export function AdminUsers() {
  const [open, setOpen] = useState(false);
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/auth/me", { signal: controller.signal, cache: "no-store" }).then(response => response.json()).then(data => setAllowed(data.role === "admin")).catch(() => {});
    return () => controller.abort();
  }, []);
  if (!allowed) return null;
  return <section className="mb-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-5">
    <div className="flex items-center gap-3"><Users className="text-blue-600" size={24} /><div><h2 className="font-bold text-slate-900">Usuários e acessos</h2><p className="text-sm text-slate-600">Cadastre a equipe e escolha onde cada conta pode entrar.</p></div></div>
    <Button onClick={() => setOpen(true)}><LockKeyhole size={16} /> Gerenciar usuários</Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        {open && <UserForm />}
      </DialogContent>
    </Dialog>
  </section>;
}

function UserForm() {
  const [grant, setGrant] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [users, setUsers] = useState<Account[]>([]);
  const [page, setPage] = useState(1);
  const [nextPage, setNextPage] = useState<number | null>(null);
  const [role, setRole] = useState("totem");

  useEffect(() => {
    if (!grant) return;
    const timer = setTimeout(() => { setGrant(""); setUsers([]); setNotice(""); setError("A confirmação expirou. Digite sua senha novamente."); }, 300_000);
    return () => clearTimeout(timer);
  }, [grant]);

  async function loadUsers(token: string, targetPage = 1) {
    const response = await fetch(`/api/admin/usuarios?page=${targetPage}`, { headers: { "x-admin-grant": token }, cache: "no-store" });
    const data = await response.json();
    if (!response.ok) { if (response.status === 401) { setGrant(""); setUsers([]); } throw new Error(data.erro ?? "Falha ao carregar usuários."); }
    setUsers(data.users); setPage(targetPage); setNextPage(data.nextPage);
  }

  async function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const password = new FormData(form).get("adminPassword");
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/usuarios/confirmar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
      form.reset();
      const data = await response.json();
      if (!response.ok) throw new Error(data.erro ?? "Não foi possível confirmar.");
      setGrant(data.token);
      await loadUsers(data.token);
    } catch (err) { setError(err instanceof Error ? err.message : "Falha de conexão."); }
    finally { setBusy(false); }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    if (fields.get("password") !== fields.get("confirmPassword")) { setError("As senhas não coincidem."); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/usuarios", { method: "POST", headers: { "Content-Type": "application/json", "x-admin-grant": grant }, body: JSON.stringify({ name: fields.get("name"), email: fields.get("email"), password: fields.get("password"), role }) });
      const data = await response.json();
      if (!response.ok) { if (response.status === 401) setGrant(""); throw new Error(data.erro ?? "Não foi possível cadastrar."); }
      form.reset(); setNotice("Usuário cadastrado. Ele já pode entrar com o e-mail e a senha definidos.");
      await loadUsers(grant);
    } catch (err) { setError(err instanceof Error ? err.message : "Falha de conexão. Verifique a lista antes de tentar novamente."); }
    finally { setBusy(false); }
  }

  async function changeRole(account: Account, value: string) {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/usuarios", { method: "PATCH", headers: { "Content-Type": "application/json", "x-admin-grant": grant }, body: JSON.stringify({ id: account.id, role: value }) });
      const data = await response.json();
      if (!response.ok) { if (response.status === 401) setGrant(""); throw new Error(data.erro ?? "Não foi possível atualizar."); }
      setNotice("Acesso atualizado."); await loadUsers(grant, page);
    } catch (err) { setError(err instanceof Error ? err.message : "Falha de conexão."); }
    finally { setBusy(false); }
  }

  async function navigate(targetPage: number) {
    setBusy(true); setError("");
    try { await loadUsers(grant, targetPage); }
    catch (err) { setError(err instanceof Error ? err.message : "Falha de conexão."); }
    finally { setBusy(false); }
  }

  return <>
    <DialogHeader><DialogTitle>{grant ? "Usuários e acessos" : "Confirme sua identidade"}</DialogTitle><DialogDescription>{grant ? "Cada conta recebe acesso apenas à área escolhida. A confirmação vale por 5 minutos." : "Digite a senha da sua conta de administrador para abrir o cadastro."}</DialogDescription></DialogHeader>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {notice && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    {!grant ? <form onSubmit={confirm} className="space-y-4">
      <label htmlFor="admin-password" className="block text-sm font-medium">Senha do administrador</label>
      <PasswordInput id="admin-password" name="adminPassword" autoComplete="current-password" required maxLength={128} disabled={busy} autoFocus />
      <Button type="submit" disabled={busy} className="w-full">{busy ? "Confirmando…" : "Confirmar e continuar"}</Button>
    </form> : <>
      <form onSubmit={create} className="space-y-4">
        <fieldset disabled={busy} className="space-y-4">
          <legend className="mb-3 font-semibold">Cadastrar usuário</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><label htmlFor="user-name" className="text-sm font-medium">Nome</label><Input id="user-name" name="name" autoComplete="off" required maxLength={100} /></div>
            <div className="space-y-2"><label htmlFor="user-email" className="text-sm font-medium">E-mail de acesso</label><Input id="user-email" name="email" type="email" autoComplete="off" required maxLength={254} /></div>
            <div className="space-y-2"><label htmlFor="user-password" className="text-sm font-medium">Senha</label><PasswordInput id="user-password" name="password" autoComplete="new-password" required minLength={12} maxLength={128} aria-describedby="password-help" /></div>
            <div className="space-y-2"><label htmlFor="user-confirm" className="text-sm font-medium">Confirmar senha</label><PasswordInput id="user-confirm" name="confirmPassword" autoComplete="new-password" required minLength={12} maxLength={128} /></div>
          </div>
          <p id="password-help" className="text-xs text-muted-foreground">Use de 12 a 128 caracteres. Guarde a senha em um gerenciador de senhas.</p>
          <fieldset><legend className="mb-2 text-sm font-medium">Área permitida</legend><div className="grid gap-3 sm:grid-cols-2">
            {[{ value: "totem", title: "Somente totem", description: "Autoatendimento e pagamento de pedidos.", Icon: Monitor }, { value: "cantina", title: "Somente cantina", description: "Caixa, cozinha e entrega de pedidos.", Icon: Store }].map(({ value, title, description, Icon }) => <label key={value} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 ${role === value ? "border-blue-600 bg-blue-50" : "border-slate-200"}`}><input type="radio" name="role" value={value} checked={role === value} onChange={() => setRole(value)} className="mt-1 accent-blue-600" /><div><span className="flex items-center gap-2 text-sm font-semibold"><Icon size={16} />{title}</span><span className="mt-1 block text-xs text-slate-600">{description}</span></div></label>)}
          </div></fieldset>
          <Button type="submit" disabled={busy}>{busy ? "Aguarde…" : "Cadastrar usuário"}</Button>
        </fieldset>
      </form>
      <section className="mt-3 border-t pt-5"><div className="mb-3 flex items-center justify-between"><h3 className="font-semibold">Contas cadastradas</h3><Button variant="ghost" disabled={busy} onClick={() => navigate(page)}>Atualizar</Button></div>
        <ul className="divide-y">{users.map(account => <li key={account.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="break-all text-sm font-medium">{account.name || account.email}</p>{account.name && <p className="break-all text-xs text-muted-foreground">{account.email}</p>}</div>{account.editable ? <select aria-label={`Acesso de ${account.email}`} disabled={busy} value={account.role} onChange={event => changeRole(account, event.target.value)} className="rounded-md border bg-background p-2 text-sm">{!["totem", "cantina"].includes(account.role) && <option value={account.role}>{labels[account.role]}</option>}<option value="totem">Somente totem</option><option value="cantina">Somente cantina</option></select> : <span className="text-xs text-muted-foreground">{labels[account.role] ?? "Sem acesso"}</span>}</li>)}</ul>
        {!users.length && <p className="text-sm text-muted-foreground">Nenhum usuário nesta página.</p>}
        <div className="mt-4 flex items-center justify-between"><Button variant="outline" disabled={busy || page <= 1} onClick={() => navigate(page - 1)}>Anterior</Button><span className="text-xs">Página {page}</span><Button variant="outline" disabled={busy || !nextPage} onClick={() => nextPage && navigate(nextPage)}>Próxima</Button></div>
      </section>
    </>}
  </>;
}
