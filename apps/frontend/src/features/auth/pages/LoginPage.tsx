import React from "react";
import { LoginBackground } from "../components/LoginBackground";
import { LoginCard } from "../components/LoginCard";
import { LoginForm } from "../components/LoginForm";
import { useLogin } from "../hooks/useLogin";
import "../styles/login.css";

/**
 * LoginPage Component
 * Retro-future login page inspired by https://github.com/puikinsh/login-forms/tree/main/forms/retro-future
 * Refactored into smaller, maintainable components
 */
const LoginPage: React.FC = () => {
  const {
    email,
    password,
    error,
    loading,
    setEmail,
    setPassword,
    handleSubmit,
  } = useLogin();

  return (
    <div className="login-page retro-login">
      <div className="login-page__shell retro-shell">
        <LoginBackground />
        <LoginCard>
          <LoginForm
            email={email}
            password={password}
            loading={loading}
            error={error}
            onEmailChange={setEmail}
            onPasswordChange={setPassword}
            onSubmit={handleSubmit}
          />
        </LoginCard>
      </div>
    </div>
  );
};


export default LoginPage;
