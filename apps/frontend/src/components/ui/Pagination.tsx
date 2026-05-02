import React from "react";

type PaginationProps = {
  currentPage: number;
  totalItems: number;
  pageSize?: number;
  onPageChange: (page: number) => void;
  className?: string;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const buildPageList = (totalPages: number, currentPage: number) => {
  const pages: (number | "...")[] = [];

  if (totalPages <= 5) {
    for (let i = 1; i <= totalPages; i += 1) pages.push(i);
    return pages;
  }

  const start = clamp(currentPage - 1, 2, totalPages - 3);
  const end = clamp(currentPage + 1, 4, totalPages - 1);

  pages.push(1);
  if (start > 2) pages.push("...");
  for (let i = start; i <= end; i += 1) pages.push(i);
  if (end < totalPages - 1) pages.push("...");
  pages.push(totalPages);

  return pages;
};

export default function Pagination({
  currentPage,
  totalItems,
  pageSize = 10,
  onPageChange,
  className = "",
}: PaginationProps) {
  const safePageSize = pageSize > 0 ? pageSize : 10;
  const totalPages = Math.max(1, Math.ceil(totalItems / safePageSize));
  const clampedCurrent = clamp(currentPage, 1, totalPages);
  const canPrev = clampedCurrent > 1;
  const canNext = clampedCurrent < totalPages;

  const navButtonClass =
    "flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/80 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40";
  const pageButtonClass =
    "flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 font-semibold text-white/80 transition hover:bg-white/10";
  const activePageClass =
    "rounded-full border border-[#6b74ff]/50 bg-gradient-to-br from-[#323b74] via-[#22294f] to-[#151c39] text-white shadow-[0_12px_30px_-14px_rgba(107,116,255,0.8)]";

  const startItem =
    totalItems === 0 ? 0 : (clampedCurrent - 1) * safePageSize + 1;
  const endItem = Math.min(clampedCurrent * safePageSize, totalItems);
  const pages = buildPageList(totalPages, clampedCurrent);

  return (
    <div
      className={`pagination flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between ${className}`}
    >
      <div className="pagination__controls flex items-center gap-1.5">
        <button
          className={`pagination__button pagination__button--nav ${navButtonClass}`}
          onClick={() => onPageChange(1)}
          disabled={!canPrev}
          aria-label="Trang đầu"
        >
          {"<<"}
        </button>

        <button
          className={`pagination__button pagination__button--nav ${navButtonClass}`}
          onClick={() => onPageChange(clampedCurrent - 1)}
          disabled={!canPrev}
          aria-label="Trang trước"
        >
          {"<"}
        </button>

        <div className="pagination__pages flex items-center gap-1.5">
          {pages.map((page, index) =>
            page === "..." ? (
              <span
                key={`ellipsis-${index}`}
                className="pagination__ellipsis flex h-10 w-10 items-center justify-center text-white/50"
              >
                ...
              </span>
            ) : (
              <button
                key={page}
                className={`pagination__button pagination__button--page ${pageButtonClass} ${
                  page === clampedCurrent ? activePageClass : ""
                }`}
                onClick={() => onPageChange(page)}
                disabled={page === clampedCurrent}
                aria-label={`Trang ${page}`}
              >
                {page}
              </button>
            )
          )}
        </div>

        <button
          className={`pagination__button pagination__button--nav ${navButtonClass}`}
          onClick={() => onPageChange(clampedCurrent + 1)}
          disabled={!canNext}
          aria-label="Trang sau"
        >
          {">"}
        </button>

        <button
          className={`pagination__button pagination__button--nav ${navButtonClass}`}
          onClick={() => onPageChange(totalPages)}
          disabled={!canNext}
          aria-label="Trang cuối"
        >
          {">>"}
        </button>
      </div>

      <div className="pagination__summary text-white/70">
        {totalItems === 0 ? "0 mục" : `${startItem}-${endItem} trong ${totalItems}`}
      </div>
    </div>
  );
}
