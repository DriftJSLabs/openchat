"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function SignUpPage() {
  const router = useRouter();

  useEffect(() => {
    // Auto-redirect to home page (no auth needed in development)
    router.push("/");
  }, [router]);

  return null;
}