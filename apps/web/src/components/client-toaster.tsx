"use client";

import { useEffect, useState } from "react";
import { Toaster } from "sonner";
import { useTheme } from "next-themes";

export function ClientToaster() {
  const [mounted, setMounted] = useState(false);
  const { theme } = useTheme();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  return (
    <Toaster
      theme={theme as "light" | "dark" | "system"}
      position="bottom-right"
      richColors
      closeButton
    />
  );
}