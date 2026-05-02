/**
 * ResponsiveTable Component
 * Wraps tables with responsive behavior - shows card view on mobile
 */

import React, { ReactNode } from "react";

interface ResponsiveTableProps {
  children: ReactNode;
  className?: string;
  cardView?: ReactNode; // Optional card view for mobile
  showCardOnMobile?: boolean; // Whether to show card view on mobile
}

/**
 * ResponsiveTable - Wraps table with mobile-friendly overflow
 * On mobile: Shows horizontal scroll
 * On larger screens: Normal table display
 */
export const ResponsiveTable: React.FC<ResponsiveTableProps> = ({
  children,
  className = "",
  cardView,
  showCardOnMobile = false,
}) => {
  if (showCardOnMobile && cardView) {
    return (
      <>
        {/* Card view for mobile */}
        <div className="block md:hidden">{cardView}</div>
        
        {/* Table view for desktop */}
        <div className={`hidden md:block ${className}`}>
          <div className="overflow-x-visible">
            <div className="inline-block min-w-full align-middle">
              {children}
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <div className={`overflow-x-auto ${className}`}>
      {children}
    </div>
  );
};

/**
 * TableCard - Component for displaying table data as cards on mobile
 */
interface TableCardProps {
  data: Record<string, unknown>[];
  renderCard: (item: Record<string, unknown>, index: number) => ReactNode;
  className?: string;
}

export const TableCard: React.FC<TableCardProps> = ({
  data,
  renderCard,
  className = "",
}) => {
  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 ${className}`}>
      {data.map((item, index) => (
        <div key={index} className="animate-in fade-in slide-in-from-bottom-3 duration-500" style={{ animationDelay: `${index * 50}ms` }}>
          {renderCard(item, index)}
        </div>
      ))}
    </div>
  );
};
