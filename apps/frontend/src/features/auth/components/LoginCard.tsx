import React from "react";

interface LoginCardProps {
  children: React.ReactNode;
}

/**
 * LoginCard Component
 * Wraps the login form in a styled card container
 */
export const LoginCard: React.FC<LoginCardProps> = ({ children }) => {
  return (
    <div className="login-card retro-card">
      <div className="login-card__header card-top">
        <div className="login-card__title-wrap title">
          <p className="login-card__eyebrow eyebrow">Chào mừng trở lại</p>
          <h1 className="login-card__title gradient-title">Đạt Phần Mềm</h1>
          <p className="login-card__subtitle subtitle">
            Nhập thông tin của bạn để vào trang quản trị.
          </p>
        </div>
      </div>
      {children}
    </div>
  );
};
