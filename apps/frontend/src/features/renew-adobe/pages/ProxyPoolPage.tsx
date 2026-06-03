import { ProxyPoolPanel } from "@/features/renew-adobe/components/ProxyPoolPanel";

export default function ProxyPoolPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white">Proxy (Adobe login)</h1>
        <p className="text-sm text-slate-400 mt-1">
          Quản lý proxy dùng khi đăng nhập tài khoản admin Adobe (Check / Add user / Delete user).
        </p>
      </div>
      <ProxyPoolPanel />
    </div>
  );
}
