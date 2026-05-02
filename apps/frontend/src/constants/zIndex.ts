/**
 * Z-Index Constants
 * Centralized z-index values to ensure proper layering
 * 
 * Usage:
 * import { Z_INDEX } from '@/constants/zIndex';
 * className={`fixed inset-0 ${Z_INDEX.MODAL_OVERLAY}`}
 */

export const Z_INDEX = {
  // Base content (0-10)
  BASE: 'z-0',
  
  // Sidebar and navigation (20-30)
  SIDEBAR_OVERLAY: 'z-30',      // Mobile sidebar backdrop
  SIDEBAR: 'z-40',               // Sidebar itself
  SIDEBAR_TOGGLE: 'z-45',        // Sidebar toggle button (above sidebar)
  
  // Dropdowns and selects (50-60)
  DROPDOWN: 'z-50',              // Standard dropdowns
  SELECT: 'z-50',                // Select components
  DATE_PICKER: 'z-50',           // Date picker dropdowns
  
  // Modals (70-90)
  MODAL_OVERLAY: 'z-70',         // Modal backdrop
  MODAL: 'z-80',                 // Standard modals
  MODAL_HIGH: 'z-90',            // High priority modals
  
  // Critical overlays (100+)
  TOAST: 'z-100',                // Toast notifications
  TOOLTIP: 'z-100',              // Tooltips
  CRITICAL_MODAL: 'z-[100]',     // Critical modals (highest)
} as const;

/**
 * Z-index values as numbers for dynamic usage
 */
export const Z_INDEX_VALUES = {
  BASE: 0,
  SIDEBAR_OVERLAY: 30,
  SIDEBAR: 40,
  SIDEBAR_TOGGLE: 45,
  DROPDOWN: 50,
  SELECT: 50,
  DATE_PICKER: 50,
  MODAL_OVERLAY: 70,
  MODAL: 80,
  MODAL_HIGH: 90,
  TOAST: 100,
  TOOLTIP: 100,
  CRITICAL_MODAL: 100,
} as const;
