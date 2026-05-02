import React from "react";

interface LoginFormProps {
  email: string;
  password: string;
  loading: boolean;
  error: string | null;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}

/**
 * LoginForm Component
 * Handles the login form UI and user interactions
 */
export const LoginForm: React.FC<LoginFormProps> = ({
  email,
  password,
  loading,
  error,
  onEmailChange,
  onPasswordChange,
  onSubmit,
}) => {
  return (
    <form className="form" onSubmit={onSubmit}>
      <label className="field">
        <span>Tài khoản</span>
        <input
          type="text"
          required
          value={email}
          onChange={(e) => onEmailChange(e.target.value)}
          placeholder="Nhập tên đăng nhập"
        />
      </label>

      <label className="field">
        <span>Mật khẩu</span>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => onPasswordChange(e.target.value)}
          placeholder="Nhập mật khẩu"
        />
      </label>

      <div className="controls">
        <button type="button" className="ghost">
          Quên mật khẩu?
        </button>
      </div>

      <button type="submit" className="cta" disabled={loading}>
        {loading ? "Đang đăng nhập..." : "Đăng nhập"}
      </button>
      
      {error && <p className="error-msg">{error}</p>}
    </form>
  );
};
