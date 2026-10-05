import { redirect } from "next/navigation";

export default function HomePage() {
  // A entrada pública do sistema é o autoatendimento da cantina.
  redirect("/totem");
}
