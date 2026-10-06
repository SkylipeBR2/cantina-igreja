import { redirect } from "next/navigation";

export default function HomePage() {
  // O proxy solicita a sessão do totem antes de abrir o autoatendimento.
  redirect("/totem");
}
