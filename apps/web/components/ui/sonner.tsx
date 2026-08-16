"use client";

import { Toaster as SonnerToaster, type ToasterProps } from "sonner";

import { useTheme } from "@/lib/theme";

/** shadcn 标准接法：sonner Toaster 跟随 <html data-theme>（手动主题机制，非系统 media query）。 */
function Toaster(props: ToasterProps) {
  const theme = useTheme();

  return (
    <SonnerToaster
      position="bottom-right"
      theme={theme}
      toastOptions={{
        classNames: {
          toast: "rounded-xl border-border bg-popover text-popover-foreground shadow-lg",
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
