import { Sparkles, Shield, Zap, KeyRound, Search } from "lucide-react";

type SlideOverlayProps = {
  isCheckMode: boolean;
  onToggle: () => void;
};

export function SlideOverlay({ isCheckMode, onToggle }: SlideOverlayProps) {
  return (
    <div
      className="absolute inset-y-0 right-0 z-20 hidden w-1/2 flex-col items-center justify-center bg-gradient-to-br from-purple-700 via-indigo-700 to-blue-800 p-12 lg:flex"
      style={{
        transform: isCheckMode ? "translateX(0%)" : "translateX(-100%)",
        transition: "transform 0.6s cubic-bezier(0.65, 0, 0.35, 1)",
      }}
    >
      <div className="animate-cp-float absolute left-8 top-8 h-4 w-4 rounded-full bg-white/20" />
      <div className="animate-cp-float-d absolute right-12 top-16 h-3 w-3 rotate-45 bg-white/15" />
      <div className="animate-cp-float absolute bottom-20 left-16 h-3 w-3 rotate-45 bg-white/15" />
      <div className="animate-cp-float-d absolute bottom-12 right-8 h-4 w-4 rounded-full bg-white/10" />
      <div className="absolute left-8 top-1/3 text-white/20">
        <Sparkles className="h-6 w-6 animate-pulse" />
      </div>
      <div className="absolute bottom-1/3 right-8 text-white/20">
        <Shield className="h-6 w-6 animate-pulse" />
      </div>
      <div className="absolute left-12 top-1/2 text-white/15">
        <Zap className="h-5 w-5 animate-pulse" />
      </div>

      <div className="flex h-24 w-24 items-center justify-center rounded-full bg-white/10 shadow-2xl ring-1 ring-white/20 backdrop-blur-sm">
        {isCheckMode ? (
          <KeyRound className="h-11 w-11 text-white" />
        ) : (
          <Search className="h-11 w-11 text-white" />
        )}
      </div>

      <div className="mt-8 text-center">
        <h2 className="text-2xl font-bold text-white">
          {isCheckMode ? "Nhận mã OTP" : "Kiểm tra & Kích hoạt"}
        </h2>
        <p className="mt-3 max-w-xs text-sm leading-relaxed text-white/70">
          {isCheckMode
            ? "Nhập email Adobe để lấy mã OTP xác thực qua hệ thống web."
            : "Kiểm tra trạng thái và kích hoạt lại Adobe profile ngay trong một bước."}
        </p>
        <button
          type="button"
          onClick={onToggle}
          className="mt-6 rounded-full border-2 border-white/50 bg-transparent px-8 py-2.5 text-sm font-bold text-white transition-all duration-300 hover:bg-white hover:text-indigo-700"
        >
          {isCheckMode ? "Nhận OTP →" : "← Kiểm tra"}
        </button>
      </div>
    </div>
  );
}
