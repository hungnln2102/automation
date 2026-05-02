/**
 * Component hiển thị bảng "Quản lý nhóm" giống trang https://www.adobe.com/manage-team
 * Cột: Người (avatar + tên + email), Vai trò, Truy cập, Hành động
 */

export type ManageTeamMember = {
  name: string | null;
  email: string;
  role?: string;
  access?: string;
  /** Có icon ở cột Sản phẩm (đã gán gói) = true */
  product?: boolean;
};

type ManageTeamTableProps = {
  members: ManageTeamMember[];
  title?: string;
  showAddUserButton?: boolean;
  /** Số hiển thị bên cạnh "Nhóm của bạn" */
  teamCount?: number;
};

const DEFAULT_TITLE = "Quản lý nhóm";
const DESCRIPTION =
  "Ở đây, bạn có thể dễ dàng quản lý tài khoản nhóm của mình. Chỉnh sửa vai trò, chỉ định hoặc mua giấy phép, thêm hoặc xóa người dùng. Đối với các nhóm lớn hoặc nhiệm vụ quản lý phức tạp, bạn nên sử dụng Admin Console.";

function PersonAvatar({ name, email }: { name: string | null; email: string }) {
  const initial = name ? name.trim().charAt(0).toUpperCase() : email.charAt(0).toUpperCase();
  return (
    <span
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-500/30 text-sm font-medium text-indigo-200"
      aria-hidden
    >
      {initial}
    </span>
  );
}

export function ManageTeamTable({
  members,
  title = DEFAULT_TITLE,
  showAddUserButton = true,
  teamCount,
}: ManageTeamTableProps) {
  const count = teamCount ?? members.length;

  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/50 overflow-hidden">
      {/* Header */}
      <div className="border-b border-white/10 bg-white/[0.02] px-4 py-5 sm:px-6">
        <h2 className="text-xl font-semibold text-white tracking-tight">{title}</h2>
        <p className="mt-2 text-sm text-white/70 leading-relaxed max-w-3xl">{DESCRIPTION}</p>
        <a
          href="https://adminconsole.adobe.com"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 inline-block text-sm text-indigo-400 hover:text-indigo-300 underline"
        >
          Admin Console
        </a>
      </div>

      {/* Section: Nhóm của bạn + Thêm người dùng */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-4 sm:px-6 border-b border-white/5">
        <h3 className="text-sm font-medium text-white/90">
          Nhóm của bạn ({count})
        </h3>
        {showAddUserButton && (
          <a
            href="https://www.adobe.com/manage-team"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-600 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
            Thêm người dùng
          </a>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-white/5 text-white">
          <thead>
            <tr className="[&>th]:px-4 [&>th]:py-3 [&>th]:text-left [&>th]:text-xs [&>th]:font-semibold [&>th]:uppercase [&>th]:tracking-wider [&>th]:text-white/60 [&>th]:bg-white/[0.03]">
              <th className="min-w-[220px]">Người</th>
              <th className="min-w-[100px]">Sản phẩm</th>
              <th className="min-w-[140px]">Vai trò</th>
              <th className="min-w-[180px]">Truy cập</th>
              <th className="w-20 text-center">Hành động</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {members.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-white/50 text-sm">
                  Chưa có thành viên nào trong nhóm.
                </td>
              </tr>
            ) : (
              members.map((member, index) => (
                <tr key={index} className="hover:bg-white/[0.02]">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <PersonAvatar name={member.name} email={member.email} />
                      <div className="min-w-0">
                        {member.name && (
                          <p className="text-sm font-medium text-white truncate">{member.name}</p>
                        )}
                        <p className="text-sm text-white/70 truncate">{member.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-sm font-medium ${member.product ? "text-emerald-400" : "text-white/50"}`}>
                      {member.product === true ? "Có" : member.product === false ? "Không" : "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 text-sm text-white/80">
                      {member.role || "—"}
                      <svg className="h-3.5 w-3.5 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-2 text-sm text-white/80">
                      {member.access !== undefined && member.access !== "" ? (
                        <>
                          <span className="flex h-5 w-5 rounded overflow-hidden bg-gradient-to-br from-orange-400 via-pink-500 to-violet-500" aria-hidden />
                          {member.access}
                        </>
                      ) : (
                        "—"
                      )}
                      <svg className="h-3.5 w-3.5 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      type="button"
                      className="p-1.5 rounded-lg text-white/50 hover:text-white/80 hover:bg-white/5 transition-colors"
                      aria-label="Menu hành động"
                    >
                      <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                        <circle cx="12" cy="6" r="1.5" />
                        <circle cx="12" cy="12" r="1.5" />
                        <circle cx="12" cy="18" r="1.5" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
