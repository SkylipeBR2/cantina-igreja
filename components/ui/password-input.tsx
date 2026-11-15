"use client";

// Adapted from UI Layout's Password Input on 21st.dev:
// https://21st.dev/@uilayout.contact/components/password-input
// Uses an accessible toggle button and the project's existing input styles.
import { Eye, EyeOff } from "lucide-react";
import { useState, type ComponentProps } from "react";
import { Input } from "@/components/ui/input";

export function PasswordInput(props: Omit<ComponentProps<typeof Input>, "type">) {
  const [visible, setVisible] = useState(false);
  return <div className="relative">
    <Input {...props} type={visible ? "text" : "password"} className={`pr-12 ${props.className ?? ""}`} />
    <button type="button" disabled={props.disabled} aria-label={visible ? "Ocultar senha" : "Mostrar senha"} aria-pressed={visible} onClick={() => setVisible(!visible)} className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-md text-muted-foreground focus-visible:outline-2 focus-visible:outline-primary">
      {visible ? <EyeOff size={18} /> : <Eye size={18} />}
    </button>
  </div>;
}
