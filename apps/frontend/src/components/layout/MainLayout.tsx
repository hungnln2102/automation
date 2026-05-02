import { useState } from "react";
import Sidebar from "./sidebar/Sidebar";

export function MainLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen app-aurora">
      <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />
      <div className="transition-all duration-500 ease-in-out lg:ml-[22.5rem] min-h-screen flex flex-col">
        {!sidebarOpen && (
          <div className="lg:hidden fixed top-6 left-6 z-40 animate-in fade-in duration-500">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-3 rounded-2xl glass-panel-light border border-white/10 text-white shadow-2xl backdrop-blur-xl"
              type="button"
            >
              <span className="sr-only">Open sidebar</span>
              <svg
                className="w-6 h-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16m-7 6h7"
                />
              </svg>
            </button>
          </div>
        )}

        <main className="flex-1 px-6 pt-4 pb-12 overflow-x-hidden">
          <div className="max-w-[1600px] mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
