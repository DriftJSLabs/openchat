"use client";

import { useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

interface AuthFormProps {
  mode: "sign-in" | "sign-up";
  onSuccess?: () => void;
}

export function AuthForm({ mode, onSuccess }: AuthFormProps) {
  const { signIn } = useAuthActions();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !password) {
      toast.error("Please fill in all fields");
      return;
    }

    if (mode === "sign-up" && password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    if (mode === "sign-up" && password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }

    setIsLoading(true);

    try {
      await signIn("password", {
        email,
        password,
        flow: mode === "sign-up" ? "signUp" : "signIn",
      });
      
      toast.success(mode === "sign-up" ? "Account created successfully!" : "Signed in successfully!");
      onSuccess?.();
    } catch (error: any) {
      const message = error.message || `Failed to ${mode === "sign-up" ? "sign up" : "sign in"}`;
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={isLoading}
          className="w-full"
          required
        />
      </div>
      
      <div>
        <Input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={isLoading}
          className="w-full"
          required
          minLength={8}
        />
      </div>

      {mode === "sign-up" && (
        <div>
          <Input
            type="password"
            placeholder="Confirm Password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={isLoading}
            className="w-full"
            required
            minLength={8}
          />
        </div>
      )}

      <Button
        type="submit"
        className="w-full"
        disabled={isLoading}
      >
        {isLoading ? "Loading..." : mode === "sign-up" ? "Sign Up" : "Sign In"}
      </Button>
    </form>
  );
}

export function SignInForm({ onSuccess }: { onSuccess?: () => void }) {
  return <AuthForm mode="sign-in" onSuccess={onSuccess} />;
}

export function SignUpForm({ onSuccess }: { onSuccess?: () => void }) {
  return <AuthForm mode="sign-up" onSuccess={onSuccess} />;
}